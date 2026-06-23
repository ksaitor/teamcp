"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RestoreReport {
  dryRun: boolean;
  settings: "restored" | "skipped";
  llmProviders: { created: number; updated: number };
  connectors: { created: number; updated: number };
  channels: { created: number; updated: number };
  members: { created: number; updated: number };
  warnings: string[];
}

const SECTIONS: { key: keyof RestoreReport; label: string }[] = [
  { key: "connectors", label: "Connectors" },
  { key: "llmProviders", label: "LLM providers" },
  { key: "channels", label: "Channels" },
  { key: "members", label: "Members" },
];

export function BackupRestore() {
  const router = useRouter();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [loading, setLoading] = useState<"preview" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function readFile(file: File) {
    setError(null);
    setReport(null);
    setDone(false);
    setFileName(file.name);
    setFileContent(await file.text());
  }

  async function submit(dryRun: boolean) {
    if (!fileContent) {
      setError("Choose a backup file first.");
      return;
    }
    setError(null);
    setLoading(dryRun ? "preview" : "restore");
    try {
      const res = await fetch("/api/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: fileContent,
          passphrase: passphrase || undefined,
          dryRun,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.toString() || "Restore failed");
      setReport(body);
      if (!dryRun) {
        setDone(true);
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-4">
      <div>
        <h2 className="font-semibold">Restore from a backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Merges a backup into this organization, matching by name and email.
          Preview first to see what changes.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {done && (
        <div className="rounded-md bg-success/10 p-3 text-sm text-success">
          Restore complete.
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-muted-foreground">
          Backup file
        </label>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
          }}
          className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
        />
        {fileName && (
          <p className="mt-1 text-xs text-muted-foreground">Selected: {fileName}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground">
          Passphrase (only if the backup is protected)
        </label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
        />
      </div>

      {report && (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium">
            {report.dryRun ? "Preview — nothing has changed yet" : "Applied"}
          </p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>Settings: {report.settings}</li>
            {SECTIONS.map(({ key, label }) => {
              const v = report[key] as { created: number; updated: number };
              return (
                <li key={key}>
                  {label}: {v.created} new, {v.updated} updated
                </li>
              );
            })}
          </ul>
          {report.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-warning">
              {report.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={loading !== null || !fileContent}
          className="rounded-md border border-input bg-card px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {loading === "preview" ? "Checking…" : "Preview"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Restore this backup into the current organization? Existing config with matching names will be overwritten.")) {
              void submit(false);
            }
          }}
          disabled={loading !== null || !fileContent}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading === "restore" ? "Restoring…" : "Restore"}
        </button>
      </div>
    </div>
  );
}
