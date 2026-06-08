/**
 * Standalone Telegram bot worker entry.
 *
 * A thin wrapper that runs the shared supervisor (src/bots/telegram/supervisor.ts)
 * as its own process — handy for local iteration (`bun run bot:telegram`) without
 * booting Next, or as the basis for a single dedicated worker if the web tier is
 * ever scaled out beyond one replica.
 *
 * In normal stateful deployments you do NOT need this: the supervisor runs
 * in-process inside server.ts. Note that the instant (signal-driven) start path
 * only fires for changes made in the same process, so this standalone entry picks
 * up admin changes via the supervisor's periodic reconcile rather than instantly.
 */
import { startTelegramSupervisor } from "./supervisor";

console.log("[telegram] worker starting…");
const stop = startTelegramSupervisor();

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  console.log("[telegram] worker shutting down…");
  stop();
  setTimeout(() => process.exit(0), 500);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
