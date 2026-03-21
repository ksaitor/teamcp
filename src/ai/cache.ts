import { createHash } from "crypto";

interface CachedDecision {
  decision: "pass" | "filter" | "block" | "uncertain";
  reasoning: string;
  filteredData?: string;
  cachedAt: number;
}

const cache = new Map<string, CachedDecision>();
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a cache key from permission rules + tool + param pattern.
 */
export function getCacheKey(
  permissionRules: string,
  toolName: string,
  paramPattern: string
): string {
  const input = `${permissionRules}|${toolName}|${paramPattern}`;
  return createHash("sha256").update(input).digest("hex");
}

export function getCachedDecision(key: string): CachedDecision | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > DEFAULT_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedDecision(key: string, decision: CachedDecision): void {
  decision.cachedAt = Date.now();
  cache.set(key, decision);

  // Simple cache size limit
  if (cache.size > 10000) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}
