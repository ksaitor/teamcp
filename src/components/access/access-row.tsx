"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface AccessRecord {
  id: string;
  label: string;
  sublabel?: string;
  connectorType: string;
  readAccess: boolean;
  writeAccess: boolean;
  aiInstructions: string | null;
  customScript: string | null;
}

interface ToolRow {
  id: string;
  toolName: string;
  description: string | null;
  allowed: boolean;
}

export function AccessRow({
  record,
  connectorId,
  membershipId,
}: {
  record: AccessRecord;
  connectorId: string;
  membershipId: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(record.aiInstructions || "");
  const [script, setScript] = useState(record.customScript || "");
  const [savingDetails, setSavingDetails] = useState(false);
  const [error, setError] = useState("");

  const [tools, setTools] = useState<ToolRow[] | null>(null);
  const [toolsLoaded, setToolsLoaded] = useState(false);

  const isMcp = record.connectorType === "EXTERNAL_MCP";

  async function patchPermission(updates: Record<string, unknown>) {
    setError("");
    const res = await fetch("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId, connectorId, ...updates }),
    });
    if (!res.ok) {
      setError("Failed to update access.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveDetails() {
    setSavingDetails(true);
    await patchPermission({ aiInstructions: note || null, customScript: script || null });
    setSavingDetails(false);
  }

  async function removeAccess() {
    setError("");
    const res = await fetch(
      `/api/permissions?membershipId=${membershipId}&connectorId=${connectorId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      setError("Failed to remove access.");
      return;
    }
    router.refresh();
  }

  async function loadTools() {
    const res = await fetch(
      `/api/connectors/${connectorId}/member-tools?membershipId=${membershipId}`
    );
    if (!res.ok) {
      setError("Failed to load tools.");
      return;
    }
    const data = await res.json();
    setTools(data.tools as ToolRow[]);
    setToolsLoaded(true);
  }

  function onToggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && isMcp && !toolsLoaded) loadTools();
  }

  async function toggleTool(tool: ToolRow) {
    setError("");
    const res = await fetch(`/api/connectors/${connectorId}/member-tools`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        membershipId,
        connectorToolId: tool.id,
        allowed: !tool.allowed,
      }),
    });
    if (!res.ok) {
      setError("Failed to update tool.");
      return;
    }
    setTools((prev) =>
      prev
        ? prev.map((t) => (t.id === tool.id ? { ...t, allowed: !t.allowed } : t))
        : prev
    );
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onToggleExpand}
            className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▼" : "▶"}
          </button>
          <div className="min-w-0">
            <span className="truncate text-sm font-medium">{record.label}</span>
            {record.sublabel && (
              <span className="ml-2 text-xs text-muted-foreground">
                {record.sublabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={record.readAccess}
              onChange={(e) => patchPermission({ readAccess: e.target.checked })}
              className="rounded"
            />
            Read
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={record.writeAccess}
              onChange={(e) => patchPermission({ writeAccess: e.target.checked })}
              className="rounded"
            />
            Write
          </label>
          <button
            onClick={removeAccess}
            className="cursor-pointer text-xs text-destructive hover:text-destructive/80"
          >
            Remove
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border px-4 py-3">
          {error && (
            <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Access note (plain-English instructions for the AI filter)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Read-only access to analytics. Never expose customer emails or revenue."
              rows={2}
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
          </div>

          <details className="group">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Custom permission script (advanced)
            </summary>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={`// Return { allow: boolean, reason?: string }
// Context: { member, connector, toolName, params, operation }
return { allow: true };`}
              rows={4}
              className="mt-2 w-full rounded-md border border-input px-3 py-2 font-mono text-xs focus:border-ring focus:outline-none"
            />
          </details>

          <Button
            onClick={saveDetails}
            disabled={savingDetails}
            size="sm"
            className="cursor-pointer disabled:cursor-default"
          >
            {savingDetails ? "Saving…" : "Save"}
          </Button>

          {isMcp && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Tool access (allowed by default — deny specific tools)
              </p>
              {!toolsLoaded ? (
                <p className="mt-2 text-sm text-muted-foreground">Loading tools…</p>
              ) : tools && tools.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5"
                    >
                      <code className="min-w-0 flex-1 truncate text-xs">
                        {tool.toolName}
                      </code>
                      <button
                        onClick={() => toggleTool(tool)}
                        className={`shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium ${
                          tool.allowed
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {tool.allowed ? "Allowed" : "Denied"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No enabled tools.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
