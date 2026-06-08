/**
 * Telegram bot supervisor.
 *
 * Drives every ACTIVE Telegram channel configured for "polling" delivery: it
 * long-polls Telegram's getUpdates per channel and feeds each message through the
 * same `processInboundMessage` pipeline the webhook route uses — so polling and
 * webhook deployments behave identically.
 *
 * This runs in-process inside the long-lived web/MCP server (server.ts) for
 * stateful deployments. Serverless hosts (Vercel) use webhook delivery and never
 * start it; there, `reconcile()` would hold no pollers anyway because
 * TELEGRAM_DELIVERY_MODE is "webhook".
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
import { CHANNEL_CHANGED, channelReconcileBus } from "@/channels/reconcile-bus";

// Safety-net full reconcile; the in-memory signal makes admin changes near-instant
// (in-process only), so this mainly catches a missed signal or out-of-band change.
const RECONCILE_INTERVAL_MS = 60_000;
// Coalesce a burst of change signals into a single reconcile.
const RECONCILE_DEBOUNCE_MS = 250;
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

// Serialize reconciles so an instant (signal-driven) run and the periodic run
// can't overlap. If a run is requested while one is in flight, queue exactly one
// follow-up so we always end on fresh state.
let reconcileRunning = false;
let reconcilePending = false;
async function runReconcile() {
  if (reconcileRunning) {
    reconcilePending = true;
    return;
  }
  reconcileRunning = true;
  try {
    await reconcile();
  } catch (err) {
    console.error("[telegram] reconcile error", err);
  } finally {
    reconcileRunning = false;
    if (reconcilePending) {
      reconcilePending = false;
      void runReconcile();
    }
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReconcile() {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runReconcile();
  }, RECONCILE_DEBOUNCE_MS);
}

let started = false;

/**
 * Start the supervisor: subscribe to the in-memory change signal (instant path),
 * run an initial reconcile, and tick a periodic safety-net reconcile. Idempotent
 * — calling it twice is a no-op. Returns a stop handle that tears down pollers,
 * the timer, and the listener.
 *
 * Note: the instant (signal-driven) path only fires for changes made in the same
 * process. The standalone worker entry relies on the periodic reconcile to pick
 * up admin changes made by the web process.
 */
export function startTelegramSupervisor(): () => void {
  if (started) return () => {};
  started = true;
  console.log("[telegram] supervisor starting…");

  // Instant path: react to admin changes signalled in-process.
  const onChange = (channelId?: string) => {
    console.log(`[telegram] change signal (${channelId || "all"})`);
    scheduleReconcile();
  };
  channelReconcileBus.on(CHANNEL_CHANGED, onChange);

  let stopping = false;

  // Initial sync, then periodic safety-net reconcile.
  void (async () => {
    await runReconcile();
    while (!stopping) {
      await sleep(RECONCILE_INTERVAL_MS);
      await runReconcile();
    }
  })();

  return () => {
    if (stopping) return;
    stopping = true;
    started = false;
    channelReconcileBus.off(CHANNEL_CHANGED, onChange);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    for (const poller of pollers.values()) poller.stop();
    pollers.clear();
    console.log("[telegram] supervisor stopped");
  };
}
