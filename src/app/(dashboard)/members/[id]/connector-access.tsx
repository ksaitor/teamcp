"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ConnectorAccess {
  id: string;
  connectorId: string;
  connectorName: string;
  connectorType: string;
  readAccess: boolean;
  writeAccess: boolean;
  aiInstructions: string | null;
  customScript: string | null;
}

interface AvailableConnector {
  id: string;
  name: string;
  type: string;
}

export function ConnectorAccessManager({
  membershipId,
  connectorAccess,
  availableConnectors,
}: {
  membershipId: string;
  connectorAccess: ConnectorAccess[];
  availableConnectors: AvailableConnector[];
}) {
  const router = useRouter();
  const [addingConnector, setAddingConnector] = useState("");

  async function addAccess(connectorId: string) {
    await fetch("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId, connectorId }),
    });
    setAddingConnector("");
    router.refresh();
  }

  async function removeAccess(connectorId: string) {
    await fetch(`/api/permissions?membershipId=${membershipId}&connectorId=${connectorId}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  async function updateAccess(connectorId: string, updates: Record<string, any>) {
    await fetch("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId, connectorId, ...updates }),
    });
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-4">
      {connectorAccess.map((ca) => (
        <ConnectorAccessCard
          key={ca.id}
          access={ca}
          onUpdate={(updates) => updateAccess(ca.connectorId, updates)}
          onRemove={() => removeAccess(ca.connectorId)}
        />
      ))}

      {availableConnectors.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={addingConnector}
            onChange={(e) => setAddingConnector(e.target.value)}
            className="rounded-md border border-input px-3 py-1.5 text-sm"
          >
            <option value="">Add connector access...</option>
            {availableConnectors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
          {addingConnector && (
            <button
              onClick={() => addAccess(addingConnector)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add
            </button>
          )}
        </div>
      )}

      {connectorAccess.length === 0 && availableConnectors.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No connectors configured. Add connectors first.
        </p>
      )}
    </div>
  );
}

function ConnectorAccessCard({
  access,
  onUpdate,
  onRemove,
}: {
  access: ConnectorAccess;
  onUpdate: (updates: Record<string, any>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [aiInstructions, setAiInstructions] = useState(access.aiInstructions || "");
  const [customScript, setCustomScript] = useState(access.customScript || "");

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {expanded ? "▼" : "▶"}
          </button>
          <div>
            <span className="font-medium text-sm">{access.connectorName}</span>
            <span className="ml-2 text-xs text-muted-foreground">{access.connectorType}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={access.readAccess}
              onChange={(e) => onUpdate({ readAccess: e.target.checked })}
              className="rounded"
            />
            Read
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={access.writeAccess}
              onChange={(e) => onUpdate({ writeAccess: e.target.checked })}
              className="rounded"
            />
            Write
          </label>
          <button
            onClick={onRemove}
            className="text-xs text-destructive hover:text-destructive/80"
          >
            Remove
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              AI Instructions (natural language permissions for this connector)
            </label>
            <textarea
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder="e.g., Only show marketing-related data. Never expose customer emails."
              rows={2}
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Custom Permission Script (JS/TS)
            </label>
            <textarea
              value={customScript}
              onChange={(e) => setCustomScript(e.target.value)}
              placeholder={`// Return { allow: boolean, reason?: string }
// Context: { member, connector, toolName, params, operation }
return { allow: true };`}
              rows={4}
              className="mt-1 w-full rounded-md border border-input px-3 py-2 font-mono text-xs"
            />
          </div>
          <button
            onClick={() => onUpdate({ aiInstructions, customScript })}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
