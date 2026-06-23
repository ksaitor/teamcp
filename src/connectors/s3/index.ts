import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { S3Config, S3Credentials } from "./types";

// Cap how much of an object body we read back into a tool response so a large
// file can't blow up the MCP payload / model context.
const MAX_OBJECT_BYTES = 100_000;

function asConfig(config: ConnectorConfig): S3Config {
  const c = config as Partial<S3Config>;
  return {
    endpoint: c.endpoint || undefined,
    region: c.region || "us-east-1",
    forcePathStyle: c.forcePathStyle ?? true,
    defaultBucket: c.defaultBucket || undefined,
  };
}

function parseCreds(credentials: DecryptedCredentials): S3Credentials {
  try {
    const parsed = JSON.parse(credentials.raw);
    if (
      parsed &&
      typeof parsed.accessKeyId === "string" &&
      typeof parsed.secretAccessKey === "string"
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return { accessKeyId: "", secretAccessKey: "" };
}

/** Resolve the bucket for a call, falling back to the configured default. */
function resolveBucket(
  params: Record<string, any>,
  cfg: S3Config
): string | undefined {
  const bucket =
    typeof params.bucket === "string" && params.bucket
      ? params.bucket
      : cfg.defaultBucket;
  return bucket || undefined;
}

export class S3Connector implements ConnectorInstance {
  type = "S3";

  listTools(config: ConnectorConfig): Tool[] {
    const cfg = asConfig(config);
    // When a default bucket is set, `bucket` becomes optional on the tools.
    const bucketRequired = !cfg.defaultBucket;
    const bucketProp = {
      type: "string",
      description: cfg.defaultBucket
        ? `Bucket name (default: ${cfg.defaultBucket})`
        : "Bucket name",
    };

    return [
      {
        name: "s3_list_buckets",
        description: "List all buckets available to these credentials",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "s3_list_objects",
        description: "List objects in a bucket, optionally filtered by prefix",
        inputSchema: {
          type: "object" as const,
          properties: {
            bucket: bucketProp,
            prefix: { type: "string", description: "Key prefix to filter by" },
            maxKeys: {
              type: "number",
              description: "Max objects to return (default: 100)",
            },
          },
          ...(bucketRequired ? { required: ["bucket"] } : {}),
        },
      },
      {
        name: "s3_get_object",
        description: "Read the contents of an object (text files only)",
        inputSchema: {
          type: "object" as const,
          properties: {
            bucket: bucketProp,
            key: { type: "string", description: "Object key" },
          },
          required: bucketRequired ? ["bucket", "key"] : ["key"],
        },
      },
      {
        name: "s3_put_object",
        description: "Create or overwrite an object with text content",
        inputSchema: {
          type: "object" as const,
          properties: {
            bucket: bucketProp,
            key: { type: "string", description: "Object key" },
            content: { type: "string", description: "Object body (text)" },
            contentType: {
              type: "string",
              description: "MIME type (default: text/plain)",
            },
          },
          required: bucketRequired
            ? ["bucket", "key", "content"]
            : ["key", "content"],
        },
      },
      {
        name: "s3_delete_object",
        description: "Delete an object from a bucket",
        inputSchema: {
          type: "object" as const,
          properties: {
            bucket: bucketProp,
            key: { type: "string", description: "Object key" },
          },
          required: bucketRequired ? ["bucket", "key"] : ["key"],
        },
      },
    ];
  }

  getNativePermissions(): NativePermissionDef[] {
    return [
      {
        key: "allowedBuckets",
        label: "Allowed Buckets",
        description: "Restrict access to specific buckets (empty = all)",
        type: "string[]",
        default: [],
      },
    ];
  }

  getOperationType(toolName: string): "read" | "write" {
    return toolName === "s3_put_object" || toolName === "s3_delete_object"
      ? "write"
      : "read";
  }

  private client(cfg: S3Config, creds: S3Credentials) {
    // Dynamic import keeps the AWS SDK out of any path the gateway loads eagerly.
    return import("@aws-sdk/client-s3").then(({ S3Client }) => {
      return new S3Client({
        region: cfg.region,
        ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
        forcePathStyle: cfg.forcePathStyle,
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
        },
      });
    });
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult> {
    const cfg = asConfig(config);
    const creds = parseCreds(credentials);
    const s3 = await import("@aws-sdk/client-s3");
    const client = await this.client(cfg, creds);

    try {
      switch (toolName) {
        case "s3_list_buckets": {
          const out = await client.send(new s3.ListBucketsCommand({}));
          const buckets = (out.Buckets ?? []).map((b) => ({
            name: b.Name,
            createdAt: b.CreationDate,
          }));
          return text(buckets);
        }

        case "s3_list_objects": {
          const bucket = requireBucket(params, cfg);
          const out = await client.send(
            new s3.ListObjectsV2Command({
              Bucket: bucket,
              Prefix: params.prefix || undefined,
              MaxKeys: params.maxKeys || 100,
            })
          );
          const objects = (out.Contents ?? []).map((o) => ({
            key: o.Key,
            size: o.Size,
            lastModified: o.LastModified,
            etag: o.ETag,
          }));
          return text({
            bucket,
            count: objects.length,
            isTruncated: out.IsTruncated ?? false,
            objects,
          });
        }

        case "s3_get_object": {
          const bucket = requireBucket(params, cfg);
          const out = await client.send(
            new s3.GetObjectCommand({ Bucket: bucket, Key: params.key })
          );
          const body = (await out.Body?.transformToString()) ?? "";
          const truncated = body.length > MAX_OBJECT_BYTES;
          return text({
            bucket,
            key: params.key,
            contentType: out.ContentType,
            contentLength: out.ContentLength,
            truncated,
            body: truncated ? body.slice(0, MAX_OBJECT_BYTES) : body,
          });
        }

        case "s3_put_object": {
          const bucket = requireBucket(params, cfg);
          await client.send(
            new s3.PutObjectCommand({
              Bucket: bucket,
              Key: params.key,
              Body: params.content,
              ContentType: params.contentType || "text/plain",
            })
          );
          return text({ bucket, key: params.key, status: "written" });
        }

        case "s3_delete_object": {
          const bucket = requireBucket(params, cfg);
          await client.send(
            new s3.DeleteObjectCommand({ Bucket: bucket, Key: params.key })
          );
          return text({ bucket, key: params.key, status: "deleted" });
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `S3 error: ${error.message}` }],
        isError: true,
      };
    } finally {
      client.destroy();
    }
  }

  async testConnection(
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean> {
    const cfg = asConfig(config);
    const creds = parseCreds(credentials);
    if (!creds.accessKeyId || !creds.secretAccessKey) return false;
    const s3 = await import("@aws-sdk/client-s3");
    const client = await this.client(cfg, creds);
    try {
      // A default bucket may be the only thing these credentials can see, so
      // prefer probing it; otherwise fall back to listing buckets.
      if (cfg.defaultBucket) {
        await client.send(
          new s3.ListObjectsV2Command({
            Bucket: cfg.defaultBucket,
            MaxKeys: 1,
          })
        );
      } else {
        await client.send(new s3.ListBucketsCommand({}));
      }
      return true;
    } catch {
      return false;
    } finally {
      client.destroy();
    }
  }
}

function requireBucket(params: Record<string, any>, cfg: S3Config): string {
  const bucket = resolveBucket(params, cfg);
  if (!bucket) {
    throw new Error("No bucket specified and no default bucket configured");
  }
  return bucket;
}

function text(value: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export default new S3Connector();
