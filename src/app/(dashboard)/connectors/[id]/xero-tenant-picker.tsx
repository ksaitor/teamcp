"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Org {
  tenantId: string;
  tenantName: string;
}

export function XeroTenantPicker({
  connectorId,
  orgs,
}: {
  connectorId: string;
  orgs: Org[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(orgs[0]?.tenantId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function commit() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/connectors/${connectorId}/xero/tenant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: selected }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      setError(
        typeof data.error === "string" ? data.error : "Could not select organisation"
      );
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-md border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Choose a Xero organisation</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This Xero login has access to multiple organisations. Pick the one this
        connector should use.
      </p>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-3 space-y-2">
        {orgs.map((org) => (
          <label
            key={org.tenantId}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <input
              type="radio"
              name="xero-org"
              value={org.tenantId}
              checked={selected === org.tenantId}
              onChange={() => setSelected(org.tenantId)}
            />
            {org.tenantName}
          </label>
        ))}
      </div>

      <Button onClick={commit} disabled={busy || !selected} className="mt-3">
        {busy ? "Saving…" : "Use this organisation"}
      </Button>
    </div>
  );
}
