/**
 * Telegram bot supervisor.
 *
 * Drives every ACTIVE Telegram channel configured for "polling" delivery: it
 * long-polls Telegram's getUpdates per channel and feeds each message through the
 * same `processInboundMessage` pipeline the webhook route uses — so polling and
 * webhook deployments behave identically.
 *
 * Runs in-process inside the long-lived web/MCP server (server.ts); in dev, use
 * `bun run dev:unified` to get it (plain `bun run dev` is Next-only). Serverless
 * hosts (Vercel) use webhook delivery and never start it; there, `reconcile()`
 * would hold no pollers anyway because TELEGRAM_DELIVERY_MODE is "webhook".
 *
 * Desired state is read straight from the DB on a short interval — admin changes
 * (create/enable/disable/delete, token rotation) are picked up within one tick,
 * from any process that writes the DB, with no cross-process signalling.
 *
 * Single-instance assumption: Telegram allows only one getUpdates consumer per
 * bot token, so exactly one supervisor may poll a given bot. Running the web app
 * as multiple replicas under polling mode would cause 409 Conflict; use webhook
 * delivery (no such constraint) if you need to scale out.
 */
import type { Channel } from "@prisma/client";
import { prisma } from "@/db";
import { processInboundMessage } from "@/channels/process";
import { deleteWebhook, getBotToken, getUpdates } from "@/channels/telegram/api";
import { TELEGRAM_DELIVERY_MODE, updateToInbound } from "@/channels/telegram";

const RECONCILE_INTERVAL_MS = 5_000;
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
  // When the deployment is configured for webhook delivery, the supervisor has
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

let started = false;

/** Start the reconcile loop. Idempotent — a second call is a no-op. */
export function startTelegramSupervisor(): void {
  if (started) return;
  started = true;
  console.log("[telegram] supervisor starting…");
  void (async () => {
    for (;;) {
      try {
        await reconcile();
      } catch (err) {
        console.error("[telegram] reconcile error", err);
      }
      await sleep(RECONCILE_INTERVAL_MS);
    }
  })();
}
