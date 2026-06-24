/**
 * Per-model token pricing, used to turn the token counts we record (from
 * provider response metadata) into an approximate dollar cost at *read* time.
 *
 * We deliberately store tokens + the model id on each usage row and price here,
 * rather than storing dollars: a price change (or a correction) is then a
 * one-line edit, never a data migration, and tokens stay the auditable ground
 * truth.
 *
 * Prices are USD per 1,000,000 tokens, split input/output. Most LLM APIs
 * (Anthropic, OpenAI, xAI, …) do **not** return a cost in their responses — only
 * token counts — so pricing is unavoidably a table we maintain. Keep it current
 * as models and prices change. Unknown models return `null` (tokens still count,
 * but no dollar figure is shown).
 */
export interface ModelPrice {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

// Anthropic prices are current as of 2026-06. Add other providers' models here
// as orgs use them; the matcher below also handles dated/suffixed ids.
const PRICES: Record<string, ModelPrice> = {
  // ── Anthropic ──────────────────────────────────────────────
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-5": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  // ── OpenAI ─────────────────────────────────────────────────
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};

/**
 * Look up a model's price, tolerating dated/suffixed ids (e.g.
 * `claude-sonnet-4-20250514` → `claude-sonnet-4`). Returns null for unknown
 * models so callers can show tokens without inventing a price.
 */
export function getModelPrice(model: string | null | undefined): ModelPrice | null {
  if (!model) return null;
  if (PRICES[model]) return PRICES[model];
  // Longest-prefix match handles dated snapshots and provider-prefixed ids
  // (e.g. "anthropic.claude-opus-4-8", "claude-sonnet-4-20250514").
  let best: { key: string; price: ModelPrice } | null = null;
  for (const [key, price] of Object.entries(PRICES)) {
    if (model.includes(key) && (!best || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best?.price ?? null;
}

/**
 * Approximate cost in USD cents for a token split on a given model.
 * Returns null when the model isn't in the price table.
 */
export function priceUsageCents(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number
): number | null {
  const price = getModelPrice(model);
  if (!price) return null;
  const dollars =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output;
  return dollars * 100;
}

/**
 * Format USD cents as a compact dollar string (e.g. "$0.00", "$12.34", "$1.2k").
 * Pure — safe to import from client components.
 */
export function formatCost(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(2)}`;
}
