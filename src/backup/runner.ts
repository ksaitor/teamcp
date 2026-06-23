/**
 * Backup runner — builds a bundle and stores it in the org's S3 destination,
 * recording a BackupRun row for the history view. Used by both the "Back up
 * now" action and the scheduler.
 *
 * Scheduled and on-demand S3 backups always use INSTANCE_KEY mode: there's no
 * passphrase available server-side, and storing one would defeat its purpose.
 * Restoring those secrets therefore requires the same ENCRYPTION_KEY.
 */
import { prisma } from "@/db";
import { decrypt } from "@/lib/crypto";
import { buildConfigBundle } from "./bundle";
import { encodeBackup } from "./archive";
import {
  newObjectKey,
  putBackup,
  getBackup,
  pruneToRetention,
  type S3Credentials,
  type S3DestinationConfig,
} from "./s3";

type DestinationRow = {
  id: string;
  config: unknown;
  credentialsEncrypted: string;
  retentionCount: number;
};

export function destinationConfig(dest: DestinationRow): S3DestinationConfig {
  return (dest.config ?? {}) as S3DestinationConfig;
}

export function destinationCredentials(dest: DestinationRow): S3Credentials {
  return JSON.parse(decrypt(dest.credentialsEncrypted)) as S3Credentials;
}

/** Run a backup to the org's configured S3 destination. */
export async function runS3Backup(
  organizationId: string,
  trigger: "MANUAL" | "SCHEDULED"
): Promise<{ ok: boolean; runId: string; objectKey?: string; error?: string }> {
  const dest = await prisma.backupDestination.findUnique({
    where: { organizationId },
  });
  if (!dest) throw new Error("No backup destination configured.");

  const run = await prisma.backupRun.create({
    data: {
      organizationId,
      destinationId: dest.id,
      trigger,
      status: "PENDING",
      mode: "INSTANCE_KEY",
    },
  });

  try {
    const config = destinationConfig(dest);
    const creds = destinationCredentials(dest);
    const bundle = await buildConfigBundle(organizationId);
    const { data } = encodeBackup(bundle);
    const key = newObjectKey(config);

    await putBackup(config, creds, key, data);
    await pruneToRetention(config, creds, dest.retentionCount);

    await prisma.$transaction([
      prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          objectKey: key,
          sizeBytes: Buffer.byteLength(data),
          completedAt: new Date(),
        },
      }),
      prisma.backupDestination.update({
        where: { id: dest.id },
        data: { lastBackupAt: new Date(), status: "ACTIVE" },
      }),
    ]);

    return { ok: true, runId: run.id, objectKey: key };
  } catch (err: any) {
    const message = err?.message || "Backup failed";
    await prisma.$transaction([
      prisma.backupRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: message, completedAt: new Date() },
      }),
      prisma.backupDestination.update({
        where: { id: dest.id },
        data: { status: "ERROR" },
      }),
    ]);
    return { ok: false, runId: run.id, error: message };
  }
}

/** Download a stored backup file from the org's destination by object key. */
export async function fetchStoredBackup(
  organizationId: string,
  objectKey: string
): Promise<string> {
  const dest = await prisma.backupDestination.findUnique({
    where: { organizationId },
  });
  if (!dest) throw new Error("No backup destination configured.");
  return getBackup(destinationConfig(dest), destinationCredentials(dest), objectKey);
}
