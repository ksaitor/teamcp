import type { LlmProvider } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { getLlmCatalogEntryByType } from "@/lib/llm-providers-catalog";
import type { LlmClient } from "./types";
import { OpenAiCompatibleClient } from "./openai-compatible";
import { AnthropicClient } from "./anthropic";

export type { LlmClient, LlmMessage, LlmCompletionRequest, LlmCompletionResponse } from "./types";

/** Build a concrete LLM client from a stored, per-org provider row. */
export function getLlmClient(provider: LlmProvider): LlmClient {
  const apiKey = provider.apiKeyEncrypted
    ? decrypt(provider.apiKeyEncrypted)
    : undefined;
  const catalog = getLlmCatalogEntryByType(provider.type);
  const baseUrl = provider.baseUrl || catalog?.defaultBaseUrl || "";
  const config = (provider.config ?? {}) as { extraHeaders?: Record<string, string> };

  if (provider.type === "ANTHROPIC") {
    if (!apiKey) throw new Error("Anthropic provider requires an API key");
    return new AnthropicClient({ apiKey, baseUrl: provider.baseUrl || undefined });
  }

  if (!baseUrl) {
    throw new Error(`Provider ${provider.type} requires a base URL`);
  }

  return new OpenAiCompatibleClient({
    baseUrl,
    apiKey,
    extraHeaders: config.extraHeaders,
  });
}
