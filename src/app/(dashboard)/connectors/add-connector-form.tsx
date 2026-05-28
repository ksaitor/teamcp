"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const connectorTypes = [
  { value: "POSTGRES", label: "PostgreSQL", placeholder: "postgresql://user:pass@host:5432/db" },
  { value: "MONGODB", label: "MongoDB", placeholder: "mongodb://user:pass@host:27017/db" },
  { value: "STRIPE", label: "Stripe", placeholder: "sk_live_..." },
  { value: "EXTERNAL_MCP", label: "External MCP Server", placeholder: "https://mcp-server.example.com" },
];

export function AddConnectorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("POSTGRES");

  const selectedType = connectorTypes.find((t) => t.value === type);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body: Record<string, any> = {
      name: formData.get("name"),
      type,
      credentials: formData.get("credentials"),
    };

    if (type === "EXTERNAL_MCP") {
      body.config = { serverUrl: formData.get("credentials") };
    }

    const res = await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(typeof data.error === "string" ? data.error : "Failed to add connector");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Add connector
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 rounded-md border border-border bg-card p-4"
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground">Name</label>
          <input
            name="name"
            required
            placeholder="e.g., Production DB"
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 rounded-md border border-input px-3 py-1.5 text-sm"
          >
            {connectorTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground">
          {type === "EXTERNAL_MCP" ? "Server URL" : "Credentials"}
        </label>
        <input
          name="credentials"
          type={type === "EXTERNAL_MCP" ? "url" : "password"}
          required
          placeholder={selectedType?.placeholder}
          className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add connector"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
