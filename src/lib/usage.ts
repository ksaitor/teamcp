import { prisma } from "@/db";
import type { LlmTokenUsage } from "@/ai/providers/types";

/**
 * Adds approximate LLM token usage to a member's denormalized lifetime
 * counters (`OrgMembership.llmInputTokens` / `llmOutputTokens`).
 *
 * Counts come straight from provider response metadata (Anthropic
 * `usage.input_tokens` / OpenAI `usage.prompt_tokens`, etc.) — we never
 * re-tokenize. Both the channel chat agent loop and the AI filter feed this.
 *
 * Like `touchLastActive`, the write is **fire-and-forget**: a usage stat must
 * never slow down or fail a real LLM request. Unlike activity it is *not*
 * throttled — we use an atomic `increment` so every call is summed exactly once
 * even across concurrent gateway/admin instances.
 */
export function recordTokenUsage(
  membershipId: string,
  usage: LlmTokenUsage | undefined
): void {
  if (!usage) return;
  const input = Math.max(0, Math.round(usage.inputTokens || 0));
  const output = Math.max(0, Math.round(usage.outputTokens || 0));
  if (input === 0 && output === 0) return;

  prisma.orgMembership
    .update({
      where: { id: membershipId },
      data: {
        llmInputTokens: { increment: input },
        llmOutputTokens: { increment: output },
      },
    })
    .catch(() => {
      // Best-effort: an approximate usage counter is not worth surfacing or
      // retrying if the increment fails.
    });
}
