"use client";

import { cn } from "@/lib/utils";
import type { SuggestedModel } from "@/lib/llm-providers-catalog";

/**
 * One-click model picks. Renders the provider's recommended models as chips;
 * clicking one fills the (still free-text) model field. Keeps the picker
 * approachable for non-technical owners who don't know exact model IDs.
 */
export function ModelSuggestions({
  models,
  value,
  onSelect,
}: {
  models: SuggestedModel[];
  value: string;
  onSelect: (id: string) => void;
}) {
  if (models.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {models.map((m) => {
        const active = value.trim() === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            title={m.id}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <span className="font-medium">{m.label ?? m.id}</span>
            {m.note && (
              <span
                className={cn(
                  "ml-1",
                  active ? "text-primary/70" : "text-muted-foreground"
                )}
              >
                · {m.note}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
