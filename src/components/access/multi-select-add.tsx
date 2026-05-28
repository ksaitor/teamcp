"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Item {
  id: string;
  label: string;
  sublabel?: string;
}

export function MultiSelectAdd({
  candidates,
  addLabel,
  onAdd,
}: {
  candidates: Item[];
  addLabel: string;
  onAdd: (ids: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  if (candidates.length === 0) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? candidates.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.sublabel || "").toLowerCase().includes(q)
      )
    : candidates;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setOpen(false);
    setChecked(new Set());
    setQuery("");
  }

  async function submit() {
    if (checked.size === 0) return;
    setBusy(true);
    await onAdd([...checked]);
    setBusy(false);
    reset();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer text-sm font-medium text-primary hover:underline"
      >
        + {addLabel}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <input
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        className="w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
      />

      <div className="max-h-56 space-y-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">No matches.</p>
        ) : (
          filtered.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <input
                type="checkbox"
                checked={checked.has(c.id)}
                onChange={() => toggle(c.id)}
                className="rounded"
              />
              <span className="min-w-0 flex-1 truncate">
                {c.label}
                {c.sublabel && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {c.sublabel}
                  </span>
                )}
              </span>
            </label>
          ))
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={submit}
          disabled={busy || checked.size === 0}
          size="sm"
          className="cursor-pointer disabled:cursor-default"
        >
          {busy ? "Adding…" : `Add${checked.size ? ` ${checked.size}` : ""}`}
        </Button>
        <button
          onClick={reset}
          className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
