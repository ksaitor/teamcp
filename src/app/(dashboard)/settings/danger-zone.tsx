"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DangerZone({
  orgName,
  suspended,
  isOwner,
}: {
  orgName: string;
  suspended: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"suspend" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSuspend() {
    setError(null);
    const next = !suspended;
    if (
      !confirm(
        next
          ? `Suspend "${orgName}"? MCP access for all members will stop until you unsuspend.`
          : `Unsuspend "${orgName}"? MCP access for active members will resume.`,
      )
    )
      return;
    setLoading("suspend");
    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: next }),
    });
    setLoading(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.toString() || "Failed to update organization");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    setError(null);
    const typed = prompt(
      `This permanently deletes "${orgName}" and all of its data (connectors, members, logs). Type the org name to confirm:`,
    );
    if (typed !== orgName) {
      if (typed !== null) setError("Org name did not match. Aborted.");
      return;
    }
    setLoading("delete");
    const res = await fetch("/api/organization", { method: "DELETE" });
    if (!res.ok) {
      setLoading(null);
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.toString() || "Failed to delete organization");
      return;
    }
    window.location.href = "/login";
  }

  if (!isOwner) {
    return (
      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only the organization owner can suspend or delete the org.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-destructive/30 bg-card p-4 space-y-4">
      <h2 className="font-semibold text-destructive">Danger zone</h2>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">
            {suspended ? "Unsuspend organization" : "Suspend organization"}
          </p>
          <p className="text-xs text-muted-foreground">
            {suspended
              ? "MCP gateway access is currently blocked for all members."
              : "Temporarily block all MCP gateway access without deleting any data."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSuspend}
          disabled={loading !== null}
          className="rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {loading === "suspend"
            ? "Working…"
            : suspended
              ? "Unsuspend"
              : "Suspend"}
        </button>
      </div>

      <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-destructive">
            Delete organization
          </p>
          <p className="text-xs text-muted-foreground">
            Permanently removes the org and every connector, member, token, and
            log. Cannot be undone.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading !== null}
          className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
        >
          {loading === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
