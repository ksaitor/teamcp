/**
 * S3 connector data model.
 *
 * Non-secret settings live in `config` (shown in the admin UI); the access key
 * pair lives in encrypted `credentials` (never displayed). The connector is
 * provider-agnostic: any S3-compatible storage (AWS, Hetzner, MinIO, Backblaze,
 * Cloudflare R2, …) works by pointing `endpoint` at the right host.
 */
export interface S3Config {
  /** S3 endpoint URL. Omit for AWS S3 (the SDK derives it from the region). */
  endpoint?: string;
  /** Region, e.g. "us-east-1" or a provider-specific value like "eu-central". */
  region: string;
  /**
   * Path-style addressing (https://endpoint/bucket/key) instead of
   * virtual-hosted (https://bucket.endpoint/key). Most non-AWS S3-compatible
   * providers require this, so it defaults to on.
   */
  forcePathStyle?: boolean;
  /** Optional default bucket, used when a tool call omits `bucket`. */
  defaultBucket?: string;
}

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}
