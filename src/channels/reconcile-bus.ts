import { EventEmitter } from "events";

/**
 * In-memory signal that a TeamRouter channel was created, updated, enabled,
 * disabled, or deleted. The Telegram supervisor listens on this and reconciles
 * immediately, so a newly-saved bot starts (or a disabled one stops) within a
 * few hundred milliseconds instead of waiting for the periodic reconcile tick.
 *
 * Replaces the previous Postgres LISTEN/NOTIFY bridge: the supervisor now runs
 * in-process (started from server.ts), so a process-local EventEmitter is all we
 * need to get from an admin API route to the supervisor.
 *
 * IMPORTANT: this emitter is pinned to `globalThis` *unconditionally* (unlike the
 * Prisma singleton in src/db, which only does so outside production). The API
 * routes run inside Next's compiled module graph while the supervisor is started
 * from server.ts in the Bun module graph — two different graphs in the same
 * process, even in production. Sharing one EventEmitter instance across them
 * requires the global pin; without it, emit and listener would be separate
 * objects and the signal would never arrive.
 */
const globalForBus = globalThis as unknown as {
  channelReconcileBus?: EventEmitter;
};

export const channelReconcileBus = globalForBus.channelReconcileBus ?? new EventEmitter();
globalForBus.channelReconcileBus = channelReconcileBus;

export const CHANNEL_CHANGED = "channelChanged";

/**
 * Signal that channel config changed so the supervisor reconciles its pollers.
 * Best-effort and synchronous: if nothing is listening (e.g. webhook-mode
 * deployment, or the supervisor isn't running) this is a no-op, and the
 * supervisor's periodic reconcile still catches up. `channelId` is informational
 * for logging — the supervisor always does a full reconcile.
 */
export function requestChannelReconcile(channelId?: string): void {
  channelReconcileBus.emit(CHANNEL_CHANGED, channelId);
}
