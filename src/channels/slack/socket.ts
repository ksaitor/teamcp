/**
 * Slack Socket Mode runner: one per ACTIVE channel in socket mode. Opens a
 * WebSocket to Slack (via apps.connections.open), acks every envelope within
 * Slack's 3s window, and feeds each message event through the shared
 * `processInboundMessage` pipeline so socket and webhook deliveries behave
 * identically. Reconnects on disconnect/error with capped backoff. Lifecycle
 * (start/stop/refresh) is driven by the generic channel supervisor.
 *
 * https://api.slack.com/apis/socket-mode
 */
import type { Channel } from "@prisma/client";
import { processInboundMessage } from "@/channels/process";
import type { ChannelRunner } from "@/channels/interface";
import { eventToInbound, getCredentials, openSocketUrl } from "./api";

const MAX_BACKOFF_MS = 60_000;

export class SlackSocketRunner implements ChannelRunner {
  private aborted = false;
  private ws: WebSocket | null = null;
  private loop: Promise<void> | null = null;
  channel: Channel;

  constructor(channel: Channel) {
    this.channel = channel;
  }

  /** Swap in a fresh channel snapshot (e.g. credentials rotated). */
  update(channel: Channel) {
    this.channel = channel;
  }

  /** Close the socket and resolve once the connect loop has fully unwound. */
  stop(): Promise<void> {
    this.aborted = true;
    try {
      this.ws?.close();
    } catch {
      // ignore — already closing/closed
    }
    this.ws = null;
    return this.loop ?? Promise.resolve();
  }

  start(): Promise<void> {
    this.loop = this.run();
    return this.loop;
  }

  private async run() {
    console.log(
      `[slack] socket mode starting for channel ${this.channel.id} (${this.channel.name})`
    );

    let backoff = 1000;
    while (!this.aborted) {
      try {
        await this.runOnce();
        // Clean close (Slack asked us to reconnect) — reconnect promptly.
        backoff = 1000;
      } catch (err) {
        if (this.aborted) break;
        console.error(
          `[slack] socket error for channel ${this.channel.id}, backing off ${backoff}ms`,
          err
        );
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
    console.log(`[slack] socket mode stopped for channel ${this.channel.id}`);
  }

  /** Open one Socket Mode connection and pump frames until it closes. */
  private async runOnce(): Promise<void> {
    const { appToken } = getCredentials(this.channel);
    if (!appToken) {
      throw new Error("Slack channel has no appToken (xapp-…) for Socket Mode");
    }
    const { url } = await openSocketUrl(appToken);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };

      const ws = new WebSocket(url);
      this.ws = ws;

      ws.addEventListener("open", () => {
        console.log(`[slack] socket connected for channel ${this.channel.id}`);
      });
      ws.addEventListener("message", (ev: MessageEvent) => {
        void this.onFrame(ws, ev.data, done);
      });
      // The browser-style API hides socket errors; treat as a recoverable drop.
      ws.addEventListener("error", () => done(new Error("Slack socket errored")));
      // Resolve (not reject) on close so the loop reconnects without backoff.
      ws.addEventListener("close", () => done());
    });
  }

  private async onFrame(
    ws: WebSocket,
    raw: unknown,
    done: (err?: Error) => void
  ) {
    let frame: any;
    try {
      frame = JSON.parse(typeof raw === "string" ? raw : String(raw));
    } catch {
      return;
    }

    switch (frame.type) {
      case "hello":
        // Connection established; nothing to do.
        return;

      case "disconnect":
        // Slack is cycling the connection (token refresh, server drain). Close
        // and let the loop reopen via apps.connections.open.
        try {
          ws.close();
        } catch {
          // ignore
        }
        done();
        return;

      case "events_api": {
        // Ack first, always — a slow agent turn must never trip the 3s window.
        this.ack(ws, frame.envelope_id);
        const inbound = eventToInbound(frame.payload?.event);
        if (!inbound || this.aborted) return;
        try {
          await processInboundMessage(this.channel, inbound);
        } catch (err) {
          console.error(`[slack] turn failed for channel ${this.channel.id}`, err);
        }
        return;
      }

      default:
        // slash_commands / interactive / etc. — ack so Slack doesn't retry, but
        // we don't act on them.
        this.ack(ws, frame.envelope_id);
        return;
    }
  }

  private ack(ws: WebSocket, envelopeId?: string) {
    if (!envelopeId) return;
    try {
      ws.send(JSON.stringify({ envelope_id: envelopeId }));
    } catch {
      // ignore — socket may be closing; Slack will redeliver on reconnect
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
