"use client";

import { useState } from "react";

export function ReauthBanner({
  connectorId,
  status,
  authMode,
  startPath,
}: {
  connectorId: string;
  status: string;
  authMode?: string;
  /** OAuth-start endpoint; defaults to the external-MCP route. */
  startPath?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reauth() {
    setBusy(true);
    setError("");
    const res = await fetch(
      startPath ?? `/api/connectors/${connectorId}/oauth/start`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.authorizeUrl) {
      setBusy(false);
      setError(
        typeof data.error === "string" ? data.error : "Could not start sign-in"
      );
      return;
    }
    window.location.href = data.authorizeUrl as string;
  }

  const message =
    status === "PENDING"
      ? "This connection hasn't finished authenticating yet."
      : "This connection has an authentication problem and isn't active.";

  return (
    <div className="mt-4 rounded-md bg-warning/10 p-3 text-sm text-warning">
      <p>{message}</p>
      {error && <p className="mt-1 text-destructive">{error}</p>}
      {authMode === "oauth" && (
        <button
          onClick={reauth}
          disabled={busy}
          className="mt-2 cursor-pointer rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-white disabled:cursor-default disabled:opacity-50"
        >
          {busy ? "Redirecting…" : "Re-authenticate"}
        </button>
      )}
    </div>
  );
}
