"use client";

import { useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";
import { Button } from "@/components/ui/button";

const inputClass =
  "mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none";

export function XeroWizard({ redirectUri }: { redirectUri: string }) {
  const [name, setName] = useState("Xero");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSetup, setShowSetup] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function copyRedirect() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the value is visible to copy manually */
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: "XERO",
          credentials: JSON.stringify({ clientId, clientSecret }),
          status: "PENDING",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusy(false);
        return setError(
          typeof data.error === "string" ? data.error : "Failed to create connector"
        );
      }

      const startRes = await fetch(`/api/connectors/${data.id}/xero/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok || !startData.authorizeUrl) {
        setBusy(false);
        return setError(
          typeof startData.error === "string"
            ? startData.error
            : "Could not start Xero sign-in"
        );
      }
      window.location.href = startData.authorizeUrl as string;
    } catch (err: any) {
      setBusy(false);
      setError(err.message || "Something went wrong");
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => setShowSetup((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium"
        >
          <span>How to set up a Xero app</span>
          <span className="text-xs text-muted-foreground">
            {showSetup ? "Hide" : "Show"}
          </span>
        </button>

        {showSetup && (
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Go to{" "}
                <a
                  href="https://developer.xero.com/app/manage"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  developer.xero.com/app/manage
                </a>{" "}
                and create a new app (choose <strong>Web app</strong>).
              </li>
              <li>
                Set the <strong>OAuth 2.0 redirect URI</strong> to exactly this
                value:
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-md border border-input bg-muted px-2 py-1 text-xs text-foreground">
                    {redirectUri}
                  </code>
                  <button
                    type="button"
                    onClick={copyRedirect}
                    className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
                  >
                    {copied ? <FiCheck className="size-3" /> : <FiCopy className="size-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </li>
              <li>
                Open the app&apos;s <strong>Configuration</strong> tab, copy the{" "}
                <strong>Client ID</strong>, and generate a{" "}
                <strong>Client Secret</strong>.
              </li>
              <li>Paste both below and continue to sign in.</li>
            </ol>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g., Xero — Acme Pte Ltd"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Client ID
          </label>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Client Secret
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            required
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            className={inputClass}
          />
        </div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Redirecting…" : "Continue to sign in"}
        </Button>
      </form>
    </div>
  );
}
