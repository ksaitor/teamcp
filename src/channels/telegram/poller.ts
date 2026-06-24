/**
 * Telegram long-polling runner: one per ACTIVE channel in polling mode. Owns a
 * getUpdates loop with its own update offset and capped backoff, feeding each
 * message through the shared `processInboundMessage` pipeline so polling and
 * webhook deliveries behave identically. Lifecycle (start/stop/refresh) is driven
 * by the generic channel supervisor.
 */
import type { Channel } from "@prisma/client";
import { processInboundMessage } from "@/channels/process";
import type { ChannelRunner } from "@/channels/interface";
import { deleteWebhook, getBotToken, getUpdates, updateToInbound } from "./api";

const LONG_POLL_TIMEOUT_S = 50;
const MAX_BACKOFF_MS = 60_000;

export class TelegramPoller implements ChannelRunner {
  private aborted = false;
  private offset = 0;
  // Aborts the in-flight getUpdates long-poll (and any backoff sleep) so a stop
  // closes the connection at once. Without this, Telegram keeps the consumer
  // slot until the 50s poll times out, and a redeploy's new instance hits a 409
  // "terminated by other getUpdates request".
  private readonly controller = new AbortController();
  private loop: Promise<void> | null = null;
  channel: Channel;

  constructor(channel: Channel) {
    this.channel = channel;
  }

  /** Swap in a fresh channel snapshot (e.g. token rotated) without losing offset. */
  update(channel: Channel) {
    this.channel = channel;
  }

  /** Abort the in-flight poll and resolve once the loop has fully unwound. */
  stop(): Promise<void> {
    this.aborted = true;
    this.controller.abort();
    return this.loop ?? Promise.resolve();
  }

  start(): Promise<void> {
    this.loop = this.run();
    return this.loop;
  }

  private async run() {
    // Polling and webhooks are mutually exclusive on Telegram's side.
    try {
      await deleteWebhook(getBotToken(this.channel));
    } catch (err) {
      console.error(`[telegram] deleteWebhook failed for channel ${this.channel.id}`, err);
    }
    console.log(`[telegram] polling started for channel ${this.channel.id} (${this.channel.name})`);

    let backoff = 1000;
    while (!this.aborted) {
      try {
        const token = getBotToken(this.channel);
        const updates = await getUpdates(
          token,
          this.offset,
          LONG_POLL_TIMEOUT_S,
          this.controller.signal
        );
        backoff = 1000; // reset after a clean poll
        for (const update of updates) {
          this.offset = update.update_id + 1;
          if (this.aborted) break;
          const inbound = updateToInbound(update);
          if (!inbound) continue;
          try {
            await processInboundMessage(this.channel, inbound);
          } catch (err) {
            console.error(`[telegram] turn failed for channel ${this.channel.id}`, err);
          }
        }
      } catch (err) {
        // stop() aborts the long-poll mid-flight; that's an expected shutdown,
        // not an error to log or back off on.
        if (this.aborted) break;
        console.error(`[telegram] poll error for channel ${this.channel.id}, backing off ${backoff}ms`, err);
        await sleep(backoff, this.controller.signal);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
    console.log(`[telegram] polling stopped for channel ${this.channel.id}`);
  }
}

/** Sleep that resolves early if the signal aborts, so a stop isn't delayed by backoff. */
function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
