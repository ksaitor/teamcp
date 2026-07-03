"use client";

import { FiTool } from "react-icons/fi";
import { cn } from "@/lib/utils";
import {
  sortModelsByToolCalls,
  type SuggestedModel,
} from "@/lib/llm-providers-catalog";

/**
 * One-click model picks. Renders the provider's recommended models as chips;
 * clicking one fills the (still free-text) model field. Keeps the picker
 * approachable for non-technical owners who don't know exact model IDs.
 *
 * Models that support tool calls are listed first and marked with a wrench —
 * Teamcp answers through tool calls, so those are the safe picks.
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
      {sortModelsByToolCalls(models).map((m) => {
        const active = value.trim() === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            title={m.id}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {m.supportsToolCalls && (
              <FiTool
                aria-label="Supports tool calls"
                className={cn(
                  "mr-1 h-3 w-3",
                  active ? "text-primary/70" : "text-muted-foreground"
                )}
              />
            )}
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
            {m.supportsToolCalls === false && (
              <span
                className={cn(
                  "ml-1",
                  active ? "text-primary/70" : "text-muted-foreground"
                )}
              >
                · No tool calls
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
