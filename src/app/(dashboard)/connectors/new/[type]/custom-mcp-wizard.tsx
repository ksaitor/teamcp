"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type AuthMode = "none" | "token" | "oauth";
type Phase = "input" | "token" | "oauth" | "working";

interface ProbeResult {
  authMode: AuthMode;
  transport: "streamable-http" | "sse";
}

/** Registrable domain from a URL, e.g. "https://api.ahrefs.com/mcp" -> "ahrefs.com". */
function domainFromUrl(raw: string): string | null {
  try {
    const host = new URL(raw).hostname;
    const parts = host.split(".").filter(Boolean);
    if (parts.length <= 2) return host;
    return parts.slice(-2).join(".");
  } catch {
    return null;
  }
}

export function CustomMcpWizard() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("input");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function fail(message: string) {
    setError(message);
    setBusy(false);
  }

  async function createConnector(
    authMode: AuthMode,
    transport: string,
    credentials: string,
    status: "ACTIVE" | "PENDING"
  ): Promise<string> {
    const res = await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type: "EXTERNAL_MCP",
        credentials,
        config: { serverUrl, transport, authMode },
        status,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        typeof data.error === "string" ? data.error : "Failed to create connector"
      );
    }
    const connector = await res.json();
    return connector.id as string;
  }

  async function testConnection(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/connectors/mcp/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        return fail(typeof data.error === "string" ? data.error : "Connection failed");
      }
      const result = data as ProbeResult;
      setProbe(result);

      if (result.authMode === "none") {
        setPhase("working");
        const id = await createConnector("none", result.transport, serverUrl, "ACTIVE");
        await discoverThenGo(id);
      } else if (result.authMode === "token") {
        setPhase("token");
        setBusy(false);
      } else {
        setPhase("oauth");
        setBusy(false);
      }
    } catch (err: any) {
      fail(err.message || "Connection failed");
    }
  }

  async function discoverThenGo(connectorId: string) {
    // Best-effort discovery; the detail page also offers a re-discover button.
    await fetch(`/api/connectors/${connectorId}/discover`, { method: "POST" }).catch(
      () => {}
    );
    router.push(`/connectors/${connectorId}`);
    router.refresh();
  }

  async function submitToken(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const id = await createConnector(
        "token",
        probe?.transport || "streamable-http",
        token,
        "ACTIVE"
      );
      await discoverThenGo(id);
    } catch (err: any) {
      fail(err.message || "Failed to connect");
    }
  }

  async function startOAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const id = await createConnector(
        "oauth",
        probe?.transport || "streamable-http",
        serverUrl,
        "PENDING"
      );
      const res = await fetch(`/api/connectors/${id}/oauth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          clientId ? { clientId, clientSecret: clientSecret || undefined } : {}
        ),
      });
      const data = await res.json();
      if (!res.ok || !data.authorizeUrl) {
        setShowAdvanced(true);
        return fail(
          typeof data.error === "string"
            ? `${data.error}. If the server requires pre-registered credentials, enter them below.`
            : "Could not start sign-in"
        );
      }
      window.location.href = data.authorizeUrl as string;
    } catch (err: any) {
      setShowAdvanced(true);
      fail(err.message || "Could not start sign-in");
    }
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none";

  return (
    <div className="mt-6 space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {phase === "working" && (
        <p className="text-sm text-muted-foreground">Connecting…</p>
      )}

      {phase === "input" && (
        <form onSubmit={testConnection} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Server URL
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => {
                const v = e.target.value;
                setServerUrl(v);
                if (!nameEdited) {
                  const d = domainFromUrl(v);
                  if (d) setName(d);
                }
              }}
              required
              placeholder="https://mcp-server.example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameEdited(true);
              }}
              required
              placeholder="e.g., ahrefs.com"
              className={inputClass}
            />
          </div>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Testing…" : "Test connection"}
          </Button>
        </form>
      )}

      {phase === "token" && (
        <form onSubmit={submitToken} className="space-y-4" autoComplete="off">
          <p className="text-sm text-muted-foreground">
            This server requires an access token or API key. Paste it below.
          </p>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Access token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              className={inputClass}
            />
          </div>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </form>
      )}

      {phase === "oauth" && (
        <form onSubmit={startOAuth} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This server uses OAuth. You&apos;ll be redirected to sign in and authorize
            TeamRouter, then brought back here.
          </p>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? "Hide" : "Advanced: provide client credentials"}
          </button>

          {showAdvanced && (
            <div className="space-y-3 rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">
                Only needed if the server doesn&apos;t support automatic client
                registration.
              </p>
              <div>
                <label className="block text-xs font-medium text-muted-foreground">
                  Client ID
                </label>
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground">
                  Client secret
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Redirecting…" : "Continue to sign in"}
          </Button>
        </form>
      )}
    </div>
  );
}
