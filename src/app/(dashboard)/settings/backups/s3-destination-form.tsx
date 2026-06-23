"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Destination {
  bucket: string;
  region: string;
  endpoint: string;
  prefix: string;
  forcePathStyle: boolean;
  schedule: string;
  retentionCount: number;
  status: string;
  lastBackupAt: string | null;
}

export function S3DestinationForm({
  allowed,
  reason,
  destination,
}: {
  allowed: boolean;
  reason: string | null;
  destination: Destination | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"save" | "run" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!allowed) {
    return (
      <div className="rounded-md border border-border bg-card p-4 space-y-2">
        <h2 className="font-semibold">Automatic S3 backups</h2>
        <p className="text-sm text-muted-foreground">
          {reason ||
            "Scheduled backups to your own S3 bucket are available on a paid plan."}
        </p>
      </div>
    );
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading("save");
    const form = new FormData(e.currentTarget);
    const secret = (form.get("secretAccessKey") as string) || undefined;
    const res = await fetch("/api/backups/destination", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket: form.get("bucket"),
        region: (form.get("region") as string) || undefined,
        endpoint: (form.get("endpoint") as string) || undefined,
        prefix: (form.get("prefix") as string) || undefined,
        forcePathStyle: form.get("forcePathStyle") === "on",
        accessKeyId: form.get("accessKeyId"),
        secretAccessKey: secret,
        schedule: form.get("schedule"),
        retentionCount: Number(form.get("retentionCount")),
      }),
    });
    setLoading(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.toString() || "Failed to save destination");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function handleRun() {
    setError(null);
    setLoading("run");
    const res = await fetch("/api/backups/run", { method: "POST" });
    setLoading(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.toString() || "Backup failed");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Remove this backup destination? Stored backups are not deleted.")) return;
    setError(null);
    setLoading("delete");
    const res = await fetch("/api/backups/destination", { method: "DELETE" });
    setLoading(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.toString() || "Failed to remove destination");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="rounded-md border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Automatic S3 backups</h2>
        {destination && (
          <span
            className={
              destination.status === "ERROR"
                ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                : "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
            }
          >
            {destination.status}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Store backups in your own S3-compatible bucket (AWS S3, Cloudflare R2,
        MinIO, Backblaze B2).
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted-foreground">Bucket</label>
          <input
            name="bucket"
            required
            defaultValue={destination?.bucket}
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Region</label>
          <input
            name="region"
            defaultValue={destination?.region}
            placeholder="us-east-1"
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Endpoint (non-AWS)
          </label>
          <input
            name="endpoint"
            type="url"
            defaultValue={destination?.endpoint}
            placeholder="https://…r2.cloudflarestorage.com"
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted-foreground">
            Key prefix (optional)
          </label>
          <input
            name="prefix"
            defaultValue={destination?.prefix}
            placeholder="teamcp-backups"
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Access key ID
          </label>
          <input
            name="accessKeyId"
            required
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Secret access key
          </label>
          <input
            name="secretAccessKey"
            type="password"
            placeholder={destination ? "•••••• (unchanged)" : ""}
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="forcePathStyle"
          defaultChecked={destination?.forcePathStyle}
        />
        Force path-style URLs (MinIO and some S3-compatible services)
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Schedule</label>
          <select
            name="schedule"
            defaultValue={destination?.schedule ?? "OFF"}
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          >
            <option value="OFF">Off (manual only)</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Keep last N backups
          </label>
          <input
            name="retentionCount"
            type="number"
            min={1}
            max={365}
            defaultValue={destination?.retentionCount ?? 7}
            className="mt-1 w-32 rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
      </div>

      {destination?.lastBackupAt && (
        <p className="text-xs text-muted-foreground">
          Last backup: {new Date(destination.lastBackupAt).toLocaleString()}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading !== null}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading === "save" ? "Saving…" : "Save destination"}
        </button>
        {destination && (
          <>
            <button
              type="button"
              onClick={handleRun}
              disabled={loading !== null}
              className="rounded-md border border-input bg-card px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {loading === "run" ? "Backing up…" : "Back up now"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading !== null}
              className="rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {loading === "delete" ? "Removing…" : "Remove"}
            </button>
          </>
        )}
        {saved && <span className="text-sm text-success">Saved!</span>}
      </div>
    </form>
  );
}
