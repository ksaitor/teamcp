"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ToolRow {
  id: string;
  toolName: string;
  description: string | null;
  enabled: boolean;
}

export function ToolList({
  connectorId,
  tools,
}: {
  connectorId: string;
  tools: ToolRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const COLLAPSED_COUNT = 5;

  async function toggle(tool: ToolRow) {
    setBusyId(tool.id);
    setError("");
    const res = await fetch(
      `/api/connectors/${connectorId}/tools/${tool.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !tool.enabled }),
      }
    );
    setBusyId(null);
    if (!res.ok) {
      setError("Failed to update tool.");
      return;
    }
    router.refresh();
  }

  async function rediscover() {
    setDiscovering(true);
    setError("");
    const res = await fetch(`/api/connectors/${connectorId}/discover`, {
      method: "POST",
    });
    setDiscovering(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Discovery failed.");
      return;
    }
    router.refresh();
  }

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const filtered = searching
    ? tools.filter(
        (t) =>
          t.toolName.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q)
      )
    : tools;

  // When not searching, collapse to the first few tools with a fade hint.
  const collapsed = !searching && !expanded && filtered.length > COLLAPSED_COUNT;
  const display = collapsed ? filtered.slice(0, COLLAPSED_COUNT) : filtered;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="shrink-0 text-lg font-semibold">Tools ({tools.length})</h2>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
            className="w-full max-w-xs rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
          <button
            onClick={rediscover}
            disabled={discovering}
            className="shrink-0 cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
          >
            {discovering ? "Discovering…" : "Re-discover tools"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {tools.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No tools discovered yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No tools match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="relative mt-2">
          <div className="space-y-2">
          {display.map((tool) => (
            <div
              key={tool.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <code className="block break-words text-sm font-medium">
                  {tool.toolName}
                </code>
                {tool.description && (
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {tool.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => toggle(tool)}
                disabled={busyId === tool.id}
                className={`shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium disabled:cursor-default disabled:opacity-50 ${
                  tool.enabled
                    ? "bg-success/10 text-success"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {busyId === tool.id
                  ? "Saving…"
                  : tool.enabled
                    ? "Enabled"
                    : "Disabled"}
              </button>
            </div>
          ))}
          </div>
          {collapsed && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-background" />
          )}
        </div>
      )}

      {!searching && filtered.length > COLLAPSED_COUNT && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 cursor-pointer text-sm font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : `Show all tools (${filtered.length})`}
        </button>
      )}
    </div>
  );
}
