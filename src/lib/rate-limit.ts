// Fixed-window in-memory rate limiter. Sufficient for the single-process
// deployment model (server.ts runs the admin UI, MCP gateway, and channel
// supervisor in one process); swap for a shared store if the app is ever
// scaled to multiple replicas.

const buckets = new Map<string, { count: number; resetAt: number }>();

const MAX_BUCKETS = 10_000;

/**
 * Returns true when `key` has exceeded `max` hits within the current window.
 * Every call counts as a hit.
 */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();

  // Opportunistic sweep so the map can't grow unbounded under churn.
  if (buckets.size >= MAX_BUCKETS) {
    for (const [k, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > max;
}

/** Best-effort client IP for rate-limit keys (first hop of x-forwarded-for). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
