/**
 * Audit log retention.
 *
 * Enforces each org's `logRetentionDays` setting (default 90, 0 = keep
 * forever) by deleting expired AuditLog rows on an hourly sweep. Runs
 * in-process inside the long-lived server (server.ts), like the channel
 * supervisor.
 */
import { prisma } from "@/db";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;

export async function sweepExpiredAuditLogs(): Promise<number> {
  const orgs = await prisma.organization.findMany({
    select: { id: true, settings: { select: { logRetentionDays: true } } },
  });

  let deleted = 0;
  for (const org of orgs) {
    const days = org.settings?.logRetentionDays ?? DEFAULT_RETENTION_DAYS;
    if (days <= 0) continue;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.auditLog.deleteMany({
      where: { organizationId: org.id, timestamp: { lt: cutoff } },
    });
    deleted += count;
  }

  if (deleted > 0) {
    console.log(`[audit] retention sweep deleted ${deleted} expired log(s)`);
  }
  return deleted;
}

let started = false;

/** Start the hourly retention sweep. Idempotent — a second call is a no-op. */
export function startAuditLogRetention(): void {
  if (started) return;
  started = true;
  void (async () => {
    for (;;) {
      try {
        await sweepExpiredAuditLogs();
      } catch (err) {
        console.error("[audit] retention sweep error", err);
      }
      await new Promise((resolve) => setTimeout(resolve, SWEEP_INTERVAL_MS));
    }
  })();
}
