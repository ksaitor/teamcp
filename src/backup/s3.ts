/**
 * S3-compatible storage for backups.
 *
 * Works with AWS S3 and any S3-compatible service (Cloudflare R2, MinIO,
 * Backblaze B2, …) via a custom `endpoint` + `forcePathStyle`. Credentials are
 * decrypted from the BackupDestination row by the caller and passed in here.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

export interface S3DestinationConfig {
  bucket: string;
  region?: string;
  endpoint?: string;
  prefix?: string;
  forcePathStyle?: boolean;
}

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface StoredBackup {
  key: string;
  size: number;
  lastModified: Date | undefined;
}

function makeClient(config: S3DestinationConfig, creds: S3Credentials): S3Client {
  return new S3Client({
    region: config.region || "us-east-1",
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });
}

function keyPrefix(config: S3DestinationConfig): string {
  const base = (config.prefix || "teamcp-backups").replace(/^\/+|\/+$/g, "");
  return base;
}

/** Build the object key for a new backup. */
export function newObjectKey(config: S3DestinationConfig): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${keyPrefix(config)}/backup-${stamp}.json`;
}

export async function putBackup(
  config: S3DestinationConfig,
  creds: S3Credentials,
  key: string,
  body: string
): Promise<void> {
  const client = makeClient(config, creds);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    })
  );
}

export async function getBackup(
  config: S3DestinationConfig,
  creds: S3Credentials,
  key: string
): Promise<string> {
  const client = makeClient(config, creds);
  const res = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key })
  );
  return (await res.Body?.transformToString()) ?? "";
}

export async function listBackups(
  config: S3DestinationConfig,
  creds: S3Credentials
): Promise<StoredBackup[]> {
  const client = makeClient(config, creds);
  const res = await client.send(
    new ListObjectsV2Command({ Bucket: config.bucket, Prefix: `${keyPrefix(config)}/` })
  );
  return (res.Contents ?? [])
    .filter((o) => o.Key)
    .map((o) => ({ key: o.Key!, size: o.Size ?? 0, lastModified: o.LastModified }))
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0));
}

/** Delete all but the newest `keep` objects. Returns the deleted keys. */
export async function pruneToRetention(
  config: S3DestinationConfig,
  creds: S3Credentials,
  keep: number
): Promise<string[]> {
  if (keep <= 0) return [];
  const backups = await listBackups(config, creds);
  const stale = backups.slice(keep).map((b) => b.key);
  if (stale.length === 0) return [];
  const client = makeClient(config, creds);
  await client.send(
    new DeleteObjectsCommand({
      Bucket: config.bucket,
      Delete: { Objects: stale.map((Key) => ({ Key })) },
    })
  );
  return stale;
}

/** Lightweight connectivity check used when saving a destination. */
export async function testDestination(
  config: S3DestinationConfig,
  creds: S3Credentials
): Promise<void> {
  const client = makeClient(config, creds);
  await client.send(
    new ListObjectsV2Command({ Bucket: config.bucket, MaxKeys: 1 })
  );
}
