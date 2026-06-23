import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { extensions } from "@/extensions";
import { BackupExport } from "./backup-export";
import { BackupRestore } from "./backup-restore";
import { S3DestinationForm } from "./s3-destination-form";
import { BackupHistory } from "./backup-history";

export default async function BackupsPage() {
  const session = await requireAdmin();

  const [destination, runs] = await Promise.all([
    prisma.backupDestination.findUnique({
      where: { organizationId: session.organizationId },
    }),
    prisma.backupRun.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const s3 = extensions.canUseS3Backups
    ? await extensions.canUseS3Backups(session.organizationId)
    : { allowed: true as const };

  const config = (destination?.config ?? {}) as {
    bucket?: string;
    region?: string;
    endpoint?: string;
    prefix?: string;
    forcePathStyle?: boolean;
  };

  return (
    <>
      <BackupExport />
      <BackupRestore />
      <S3DestinationForm
        allowed={s3.allowed}
        reason={s3.allowed ? null : s3.reason}
        destination={
          destination
            ? {
                bucket: config.bucket ?? "",
                region: config.region ?? "",
                endpoint: config.endpoint ?? "",
                prefix: config.prefix ?? "",
                forcePathStyle: config.forcePathStyle ?? false,
                schedule: destination.schedule,
                retentionCount: destination.retentionCount,
                status: destination.status,
                lastBackupAt: destination.lastBackupAt?.toISOString() ?? null,
              }
            : null
        }
      />
      <BackupHistory
        runs={runs.map((r) => ({
          id: r.id,
          trigger: r.trigger,
          status: r.status,
          mode: r.mode,
          sizeBytes: r.sizeBytes,
          objectKey: r.objectKey,
          error: r.error,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
