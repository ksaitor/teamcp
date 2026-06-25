"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiRefreshCw, FiChevronDown, FiChevronUp } from "react-icons/fi";

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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const COLLAPSED_COUNT = 6;
  const enabledCount = tools.filter((t) => t.enabled).length;

  async function setAll(enabled: boolean) {
    setBulkBusy(true);
    setError("");
    const res = await fetch(`/api/connectors/${connectorId}/tools`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setBulkBusy(false);
    if (!res.ok) {
      setError("Failed to update tools.");
      return;
    }
    router.refresh();
  }

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
      <div className="flex items-center gap-3">
        <h2 className="shrink-0 text-lg font-semibold">
          Tools ({enabledCount}/{tools.length} enabled)
        </h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools…"
          className="w-full max-w-xs rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
        />
        {tools.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setAll(true)}
              disabled={bulkBusy}
              className="cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
            >
              Enable all
            </button>
            <button
              onClick={() => setAll(false)}
              disabled={bulkBusy}
              className="cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
            >
              Disable all
            </button>
          </div>
        )}
        <button
          onClick={rediscover}
          disabled={discovering}
          className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
        >
          <FiRefreshCw className={`h-4 w-4 ${discovering ? "animate-spin" : ""}`} />
          {discovering ? "Discovering…" : "Re-discover tools"}
        </button>
        {!searching && tools.length > COLLAPSED_COUNT && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            {expanded ? (
              <FiChevronUp className="h-4 w-4" />
            ) : (
              <FiChevronDown className="h-4 w-4" />
            )}
            {expanded ? "Show less" : "Show all"}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Newly discovered tools start <strong>disabled</strong>. Enable only the
        ones your team needs — this keeps each member&rsquo;s tool list focused
        and within model limits.
      </p>

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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {display.map((tool) => (
            <div
              key={tool.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <code className="block break-words text-sm font-medium">
                  {tool.toolName}
                </code>
                {tool.description && (
                  <p
                    className={`mt-0.5 break-words text-xs text-muted-foreground ${
                      expanded || searching ? "" : "line-clamp-3"
                    }`}
                  >
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
            <button
              onClick={() => setExpanded(true)}
              className="absolute inset-x-0 bottom-0 flex h-24 cursor-pointer items-end justify-center bg-gradient-to-b from-transparent to-background pb-1"
              aria-label={`Show all ${filtered.length} tools`}
            >
              <span className="rounded-md border border-input bg-card px-4 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
                Show all tools ({filtered.length})
              </span>
            </button>
          )}
        </div>
      )}

      {!searching && expanded && filtered.length > COLLAPSED_COUNT && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-2 w-full cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Show less
        </button>
      )}
    </div>
  );
}
