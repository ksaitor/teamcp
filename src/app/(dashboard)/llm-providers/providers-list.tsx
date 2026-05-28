"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProviderGlyph } from "@/components/provider-glyph";
import {
  getLlmCatalogEntryByType,
  type LlmProviderType,
} from "@/lib/llm-providers-catalog";

interface ProviderItem {
  id: string;
  name: string;
  type: LlmProviderType;
  defaultModel: string;
  baseUrl: string | null;
  status: "ACTIVE" | "DISABLED" | "ERROR";
  hasApiKey: boolean;
  isDefault: boolean;
}

const statusClass: Record<ProviderItem["status"], string> = {
  ACTIVE: "bg-success/10 text-success",
  ERROR: "bg-destructive/10 text-destructive",
  DISABLED: "bg-muted text-muted-foreground",
};

export function ProvidersList({ items }: { items: ProviderItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  async function setDefault(id: string) {
    setBusyId(id);
    setError("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultLlmProviderId: id }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError("Failed to set default provider.");
      return;
    }
    router.refresh();
  }

  async function test(id: string) {
    setBusyId(id);
    setError("");
    setTestResult((r) => ({ ...r, [id]: "" }));
    const res = await fetch(`/api/llm-providers/${id}/test`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    setTestResult((r) => ({
      ...r,
      [id]: data.ok ? "Connection OK" : `Failed: ${data.message || "check credentials"}`,
    }));
    router.refresh();
  }

  async function remove(id: string) {
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/llm-providers/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      setError("Failed to delete provider.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {items.map((p) => {
        const entry = getLlmCatalogEntryByType(p.type);
        const busy = busyId === p.id;
        return (
          <Card key={p.id} className="px-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
                <ProviderGlyph logo={entry?.logo} icon={entry?.icon} className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.isDefault && (
                    <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                      Default
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass[p.status]}`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {entry?.label ?? p.type} · {p.defaultModel}
                </p>
                {testResult[p.id] && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {testResult[p.id]}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!p.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setDefault(p.id)}
                  >
                    Set default
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => test(p.id)}
                >
                  {busy ? "…" : "Test"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(p.id)}
                  className="text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
