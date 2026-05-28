"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Connector {
  id: string;
  status: string;
  skipAiFilter: boolean;
}

export function ConnectorControls({ connector }: { connector: Connector }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggleStatus() {
    setLoading(true);
    await fetch(`/api/connectors/${connector.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: connector.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
      }),
    });
    setLoading(false);
    router.refresh();
  }

  async function toggleAiFilter() {
    setLoading(true);
    await fetch(`/api/connectors/${connector.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skipAiFilter: !connector.skipAiFilter }),
    });
    setLoading(false);
    router.refresh();
  }

  async function deleteConnector() {
    if (!confirm("Delete this connector? This will remove all member access.")) return;
    setLoading(true);
    await fetch(`/api/connectors/${connector.id}`, { method: "DELETE" });
    router.push("/connectors");
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={toggleAiFilter}
        disabled={loading}
        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
          connector.skipAiFilter
            ? "bg-warning/10 text-warning"
            : "bg-info/10 text-info"
        } disabled:opacity-50`}
      >
        {connector.skipAiFilter ? "AI Filter: OFF" : "AI Filter: ON"}
      </button>
      <button
        onClick={toggleStatus}
        disabled={loading}
        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
          connector.status === "ACTIVE"
            ? "bg-warning/10 text-warning"
            : "bg-success/10 text-success"
        } disabled:opacity-50`}
      >
        {connector.status === "ACTIVE" ? "Disable" : "Enable"}
      </button>
      <button
        onClick={deleteConnector}
        disabled={loading}
        className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
