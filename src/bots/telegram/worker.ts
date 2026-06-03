/**
 * Standalone Telegram bot worker.
 *
 * A stateful, long-running process (run it with `bun run bot:telegram`) that
 * drives every ACTIVE Telegram channel configured for "polling" delivery. It
 * long-polls Telegram's getUpdates per channel and feeds each message through
 * the same `processInboundMessage` pipeline the webhook route uses — so polling
 * and webhook deployments behave identically.
 *
 * This is deliberately decoupled from the web/MCP server (server.ts): serverless
 * hosts (Vercel) use webhook delivery and never run this; stateful hosts run
 * one of these alongside the web server.
 */
import type { Channel } from "@prisma/client";
import { prisma } from "@/db";
import { processInboundMessage } from "@/channels/process";
import { deleteWebhook, getBotToken, getUpdates } from "@/channels/telegram/api";
import { TELEGRAM_DELIVERY_MODE, updateToInbound } from "@/channels/telegram";

const RECONCILE_INTERVAL_MS = 15_000;
const LONG_POLL_TIMEOUT_S = 50;
const MAX_BACKOFF_MS = 60_000;

class ChannelPoller {
  private aborted = false;
  private offset = 0;
  channel: Channel;

  constructor(channel: Channel) {
    this.channel = channel;
  }

  /** Swap in a fresh channel snapshot (e.g. token rotated) without losing offset. */
  update(channel: Channel) {
    this.channel = channel;
  }

  stop() {
    this.aborted = true;
  }

  async start() {
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
        const updates = await getUpdates(token, this.offset, LONG_POLL_TIMEOUT_S);
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
        if (this.aborted) break;
        console.error(`[telegram] poll error for channel ${this.channel.id}, backing off ${backoff}ms`, err);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
    console.log(`[telegram] polling stopped for channel ${this.channel.id}`);
  }
}

const pollers = new Map<string, ChannelPoller>();

async function reconcile() {
  // When the deployment is configured for webhook delivery, the worker has
  // nothing to do — Telegram pushes to the /webhook route instead.
  const polling =
    TELEGRAM_DELIVERY_MODE === "polling"
      ? await prisma.channel.findMany({ where: { type: "TELEGRAM", status: "ACTIVE" } })
      : [];
  const wanted = new Set(polling.map((c) => c.id));

  // Stop pollers whose channel disappeared or was disabled.
  for (const [id, poller] of pollers) {
    if (!wanted.has(id)) {
      poller.stop();
      pollers.delete(id);
    }
  }

  // Start new pollers; refresh snapshots for existing ones.
  for (const channel of polling) {
    const existing = pollers.get(channel.id);
    if (existing) {
      existing.update(channel);
    } else {
      const poller = new ChannelPoller(channel);
      pollers.set(channel.id, poller);
      void poller.start();
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[telegram] worker starting…");

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log("[telegram] worker shutting down…");
    for (const poller of pollers.values()) poller.stop();
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (!stopping) {
    try {
      await reconcile();
    } catch (err) {
      console.error("[telegram] reconcile error", err);
    }
    await sleep(RECONCILE_INTERVAL_MS);
  }
}

void main();
