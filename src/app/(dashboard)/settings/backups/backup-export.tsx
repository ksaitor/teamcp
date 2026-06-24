"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BackupExport() {
  const router = useRouter();
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    if (usePassphrase && passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/backups/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usePassphrase ? { passphrase } : {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.toString() || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `teamcp-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-4">
      <div>
        <h2 className="font-semibold">Download a backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Exports your full configuration — connectors, providers, channels,
          members, and per-member access — as a single file.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={usePassphrase}
          onChange={(e) => setUsePassphrase(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Protect with a passphrase
          <span className="block text-xs text-muted-foreground">
            Encrypts the whole file so it can be restored on a different server.
            Without a passphrase, secrets stay tied to this instance&apos;s
            encryption key and only restore here.
          </span>
        </span>
      </label>

      {usePassphrase && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Passphrase
          </label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="At least 8 characters"
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
          <p className="mt-1 text-xs text-warning">
            Store it safely — the backup can&apos;t be restored without it.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "Preparing…" : "Download backup"}
      </button>
    </div>
  );
}
