"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Run {
  id: string;
  trigger: string;
  status: string;
  mode: string;
  sizeBytes: number | null;
  objectKey: string | null;
  error: string | null;
  createdAt: string;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_CLASS: Record<string, string> = {
  SUCCESS: "bg-success/10 text-success",
  FAILED: "bg-destructive/10 text-destructive",
  PENDING: "bg-info/10 text-info",
};

export function BackupHistory({ runs }: { runs: Run[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(objectKey: string) {
    if (!confirm("Restore this stored backup into the current organization?")) return;
    setError(null);
    setBusy(objectKey);
    try {
      const res = await fetch("/api/backups/restore-stored", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.toString() || "Restore failed");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <h2 className="font-semibold">Backup history</h2>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No backups yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">When</th>
                <th className="py-1 pr-3 font-medium">Trigger</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 pr-3 font-medium">Size</th>
                <th className="py-1 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">
                    {run.trigger === "SCHEDULED" ? "Scheduled" : "Manual"}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_CLASS[run.status] ?? "bg-muted text-muted-foreground"
                      }`}
                      title={run.error ?? undefined}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {formatSize(run.sizeBytes)}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {run.objectKey && run.status === "SUCCESS" && (
                      <button
                        type="button"
                        onClick={() => restore(run.objectKey!)}
                        disabled={busy !== null}
                        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        {busy === run.objectKey ? "Restoring…" : "Restore"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
