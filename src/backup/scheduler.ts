/**
 * Scheduled S3 backups.
 *
 * Runs in-process inside the long-lived server (server.ts), like the audit
 * retention sweep. Hourly, it finds destinations whose schedule is due
 * (DAILY/WEEKLY, compared against `lastBackupAt`) and runs a backup. OFF
 * destinations are ignored.
 */
import { prisma } from "@/db";
import { runS3Backup } from "./runner";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function isDue(schedule: "DAILY" | "WEEKLY", lastBackupAt: Date | null): boolean {
  if (!lastBackupAt) return true;
  const elapsed = Date.now() - lastBackupAt.getTime();
  const period = schedule === "DAILY" ? DAY_MS : 7 * DAY_MS;
  // Small slack so an hourly sweep doesn't perpetually miss a 24h boundary.
  return elapsed >= period - SWEEP_INTERVAL_MS / 2;
}

export async function sweepScheduledBackups(): Promise<number> {
  const destinations = await prisma.backupDestination.findMany({
    where: { status: { not: "DISABLED" }, schedule: { in: ["DAILY", "WEEKLY"] } },
    select: { organizationId: true, schedule: true, lastBackupAt: true },
  });

  let ran = 0;
  for (const dest of destinations) {
    if (!isDue(dest.schedule as "DAILY" | "WEEKLY", dest.lastBackupAt)) continue;
    try {
      const result = await runS3Backup(dest.organizationId, "SCHEDULED");
      if (result.ok) ran++;
      else console.error(`[backup] scheduled backup failed: ${result.error}`);
    } catch (err) {
      console.error("[backup] scheduled backup error", err);
    }
  }

  if (ran > 0) console.log(`[backup] scheduler ran ${ran} backup(s)`);
  return ran;
}

let started = false;

/** Start the hourly backup scheduler. Idempotent — a second call is a no-op. */
export function startBackupScheduler(): void {
  if (started) return;
  started = true;
  void (async () => {
    for (;;) {
      try {
        await sweepScheduledBackups();
      } catch (err) {
        console.error("[backup] scheduler sweep error", err);
      }
      await new Promise((resolve) => setTimeout(resolve, SWEEP_INTERVAL_MS));
    }
  })();
}
