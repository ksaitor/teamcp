"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { S3Config, S3Credentials } from "@/connectors/s3/types";

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:outline-none";
const labelClass = "block text-xs font-medium text-muted-foreground";

export function S3Form() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [forcePathStyle, setForcePathStyle] = useState(true);
  const [defaultBucket, setDefaultBucket] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");

  function validate(): string | null {
    if (!name.trim()) return "Name is required";
    if (!region.trim()) return "Region is required";
    if (endpoint.trim()) {
      try {
        new URL(endpoint.trim());
      } catch {
        return "Endpoint must be a valid URL (e.g., https://s3.example.com)";
      }
    }
    if (!accessKeyId.trim()) return "Access key ID is required";
    if (!secretAccessKey.trim()) return "Secret access key is required";
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);

    const config: S3Config = {
      region: region.trim(),
      forcePathStyle,
      ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
      ...(defaultBucket.trim() ? { defaultBucket: defaultBucket.trim() } : {}),
    };

    const credentials: S3Credentials = {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
    };

    const res = await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        type: "S3",
        credentials: JSON.stringify(credentials),
        config,
      }),
    });

    if (!res.ok) {
      setLoading(false);
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Failed to add connector"
      );
      return;
    }

    router.push("/connectors");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6" autoComplete="off">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Basics</h2>
        <div>
          <label className={labelClass}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g., Production assets"
            className={`${inputClass} mt-1`}
            data-1p-ignore
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Endpoint</h2>
        <p className="text-sm text-muted-foreground">
          Works with any S3-compatible storage. Leave the endpoint blank for AWS
          S3; set it for Hetzner, MinIO, Cloudflare R2, Backblaze, and others.
        </p>
        <div>
          <label className={labelClass}>Endpoint URL (optional)</label>
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://fsn1.your-objectstorage.com"
            className={`${inputClass} mt-1`}
            data-1p-ignore
          />
        </div>
        <div>
          <label className={labelClass}>Region</label>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            required
            placeholder="us-east-1"
            className={`${inputClass} mt-1`}
            data-1p-ignore
          />
        </div>
        <div>
          <label className={labelClass}>Default bucket (optional)</label>
          <input
            value={defaultBucket}
            onChange={(e) => setDefaultBucket(e.target.value)}
            placeholder="my-bucket"
            className={`${inputClass} mt-1`}
            data-1p-ignore
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Used when a tool call doesn&apos;t specify a bucket.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={forcePathStyle}
            onChange={(e) => setForcePathStyle(e.target.checked)}
            className="size-4 rounded border-input"
          />
          <span>
            Use path-style addressing
            <span className="text-muted-foreground">
              {" "}
              — required by most non-AWS providers
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Credentials</h2>
        <p className="text-sm text-muted-foreground">
          Stored encrypted at rest and never displayed again.
        </p>
        <div>
          <label className={labelClass}>Access key ID</label>
          <input
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value)}
            required
            autoComplete="off"
            placeholder="AKIA… / your access key"
            className={`${inputClass} mt-1 font-mono`}
            data-1p-ignore
            data-lpignore="true"
          />
        </div>
        <div>
          <label className={labelClass}>Secret access key</label>
          <input
            value={secretAccessKey}
            onChange={(e) => setSecretAccessKey(e.target.value)}
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••••••••••"
            className={`${inputClass} mt-1 font-mono`}
            data-1p-ignore
            data-lpignore="true"
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? "Adding…" : "Add connector"}
        </Button>
      </div>
    </form>
  );
}
