/**
 * Channel supervisor.
 *
 * Drives long-lived per-channel runners for any channel type whose adapter pulls
 * messages instead of receiving webhooks (Telegram long-polling today, Slack
 * Socket Mode tomorrow). It is channel-agnostic: it reads ACTIVE channels from
 * the DB on a short interval and asks each adapter's `createRunner` whether a
 * runner is needed, then diffs the result against the currently-running set —
 * starting new runners, refreshing existing ones, and stopping orphaned ones.
 *
 * Runs in-process inside the long-lived web/MCP server (server.ts); in dev, use
 * `bun run dev:unified` to get it (plain `bun run dev` is Next-only). Serverless
 * hosts (Vercel) never start it, and adapters there return null from createRunner
 * (webhook delivery), so it would hold no runners anyway.
 *
 * Desired state is read straight from the DB, so admin changes (create/enable/
 * disable/delete, token rotation) are picked up within one tick, from any process
 * that writes the DB, with no cross-process signalling.
 *
 * Single-instance assumption: platforms like Telegram allow only one consumer per
 * bot token, so exactly one supervisor may run a given channel. Running the web
 * app as multiple replicas would cause conflicts; use webhook delivery (no such
 * constraint) if you need to scale out.
 */
import { prisma } from "@/db";
import { getChannelAdapter } from "./registry";
import type { ChannelRunner } from "./interface";

const RECONCILE_INTERVAL_MS = 5_000;

const runners = new Map<string, ChannelRunner>();

async function reconcile() {
  const active = await prisma.channel.findMany({ where: { status: "ACTIVE" } });
  const wanted = new Set<string>();

  for (const channel of active) {
    const adapter = getChannelAdapter(channel.type);
    if (!adapter.createRunner) continue;

    const existing = runners.get(channel.id);
    if (existing) {
      // Already running — refresh its snapshot and keep it. Delivery mode is a
      // deploy-time constant, so a running channel never stops wanting a runner
      // unless it's disabled/deleted (handled by the orphan sweep below).
      existing.update(channel);
      wanted.add(channel.id);
      continue;
    }

    const runner = adapter.createRunner(channel);
    if (runner) {
      runners.set(channel.id, runner);
      wanted.add(channel.id);
      void runner.start();
    }
  }

  // Stop runners whose channel disappeared, was disabled, or no longer wants one.
  for (const [id, runner] of runners) {
    if (!wanted.has(id)) {
      runner.stop();
      runners.delete(id);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let started = false;

/** Start the reconcile loop. Idempotent — a second call is a no-op. */
export function startChannelSupervisor(): void {
  if (started) return;
  started = true;
  console.log("[channels] supervisor starting…");
  void (async () => {
    for (;;) {
      try {
        await reconcile();
      } catch (err) {
        console.error("[channels] reconcile error", err);
      }
      await sleep(RECONCILE_INTERVAL_MS);
    }
  })();
}
