import { prisma } from "@/db";

/**
 * Postgres LISTEN/NOTIFY channel name used to tell the standalone bot worker
 * that a TeamRouter channel was created, updated, enabled, disabled, or deleted.
 * The worker reconciles immediately on notify, so a newly-saved bot starts (or a
 * disabled one stops) within a few hundred milliseconds instead of waiting for
 * the periodic reconcile tick.
 */
export const CHANNELS_NOTIFY_CHANNEL = "teamrouter_channels";

/**
 * Emit a NOTIFY on the channels-changed channel. Best-effort: if it fails
 * (e.g. transient DB hiccup) the worker's periodic reconcile still catches up,
 * so we never fail the originating request over a missed notification.
 *
 * Uses pg_notify() rather than a literal NOTIFY statement so the payload is
 * safely parameterized.
 */
export async function notifyChannelsChanged(channelId?: string): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT pg_notify(${CHANNELS_NOTIFY_CHANNEL}, ${channelId ?? ""})`;
  } catch (err) {
    console.error("notifyChannelsChanged failed", err);
  }
}
