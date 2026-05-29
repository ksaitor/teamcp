"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiCheck, FiCopy, FiTrash2 } from "react-icons/fi";

interface TokenSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export function ConnectionTokens({
  membershipId,
  tokens,
}: {
  membershipId: string;
  tokens: TokenSummary[];
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    setError(null);
    setNewToken(null);
    try {
      const res = await fetch("/api/mcp-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate token");
      setNewToken(data.accessToken);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/mcp-token?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke token");
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRevokingId(null);
    }
  }

  async function copy() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Access Tokens
        </h3>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {generating ? "Generating…" : "Generate token"}
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {newToken && (
        <div className="mt-3 rounded-md bg-success/10 p-3 text-sm text-success">
          <p className="font-medium">
            Copy this token now — it won&apos;t be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="block flex-1 break-all rounded-md border border-border bg-background px-2 py-1 text-foreground">
              {newToken}
            </code>
            <button
              type="button"
              onClick={copy}
              className="flex shrink-0 items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {copied ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No tokens yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {tokens.map((t) => {
            const expired = new Date(t.expiresAt) < new Date();
            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-4 py-2"
              >
                <div className="text-xs text-muted-foreground">
                  <span className="text-foreground">
                    Created {formatDate(t.createdAt)}
                  </span>
                  <span className="mx-1">·</span>
                  {expired ? (
                    <span className="text-destructive">
                      Expired {formatDate(t.expiresAt)}
                    </span>
                  ) : (
                    <span>Expires {formatDate(t.expiresAt)}</span>
                  )}
                  <span className="mx-1">·</span>
                  <span>Last used {formatDate(t.lastUsedAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(t.id)}
                  disabled={revokingId === t.id}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                >
                  <FiTrash2 className="h-4 w-4" />
                  {revokingId === t.id ? "Revoking…" : "Revoke"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
