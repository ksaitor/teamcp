/**
 * OpenAI / OpenRouter models retiring 2027-01-14 (and their dated snapshots).
 * Saved `defaultModel` / `modelOverride` values stay as-is in the DB; at call
 * time we remap so traffic keeps working after shutdown. The Models UI shows a
 * warning when a stored id is in this map so owners can update the free-text
 * field when convenient.
 *
 * Mapping: flagship gpt-4o / gpt-4.1 → GPT-6 Luna; mini → GPT-5.6 Luna.
 * OpenAI's deprecation docs recommend gpt-6-luna for all of these; we still
 * send mini traffic to gpt-5.6-luna so it stays on a distinct "fast" pick
 * alongside the catalog's GPT-6 Luna flagship suggestion.
 */

const RETIRED_TO_REPLACEMENT: Record<string, string> = {
  // Direct OpenAI
  "gpt-4o": "gpt-6-luna",
  "gpt-4o-2024-05-13": "gpt-6-luna",
  "gpt-4o-2024-08-06": "gpt-6-luna",
  "gpt-4o-2024-11-20": "gpt-6-luna",
  "gpt-4.1": "gpt-6-luna",
  "gpt-4.1-2025-04-14": "gpt-6-luna",
  "gpt-4o-mini": "gpt-5.6-luna",
  "gpt-4o-mini-2024-07-18": "gpt-5.6-luna",
  "gpt-4.1-mini": "gpt-5.6-luna",
  "gpt-4.1-mini-2025-04-14": "gpt-5.6-luna",
  // OpenRouter
  "openai/gpt-4o": "openai/gpt-6-luna",
  "openai/gpt-4o-2024-05-13": "openai/gpt-6-luna",
  "openai/gpt-4o-2024-08-06": "openai/gpt-6-luna",
  "openai/gpt-4o-2024-11-20": "openai/gpt-6-luna",
  "openai/gpt-4.1": "openai/gpt-6-luna",
  "openai/gpt-4.1-2025-04-14": "openai/gpt-6-luna",
  "openai/gpt-4o-mini": "openai/gpt-5.6-luna",
  "openai/gpt-4o-mini-2024-07-18": "openai/gpt-5.6-luna",
  "openai/gpt-4.1-mini": "openai/gpt-5.6-luna",
  "openai/gpt-4.1-mini-2025-04-14": "openai/gpt-5.6-luna",
};

/** True when the stored model id is scheduled for OpenAI/OpenRouter retirement. */
export function isRetiredModel(model: string | null | undefined): boolean {
  return !!model && model in RETIRED_TO_REPLACEMENT;
}

/** Replacement id for a retired model, or null if the id is current. */
export function getRetiredModelReplacement(
  model: string | null | undefined
): string | null {
  if (!model) return null;
  return RETIRED_TO_REPLACEMENT[model] ?? null;
}

/** Remap a retiring model id to its replacement; pass through unknowns. */
export function resolveRetiredModel(model: string): string {
  return RETIRED_TO_REPLACEMENT[model] ?? model;
}
