import { prisma } from "@/db";
import { getAnthropicClient } from "../client";
import type { LlmClient } from "./types";
import { getLlmClient } from "./index";
import { anthropicAgentTurn, anthropicAgentTurnStream } from "./anthropic";

/**
 * Resolve the LLM client an org should use for the AI filter.
 * 1. The configured default LlmProvider (if ACTIVE).
 * 2. Fallback to the global ANTHROPIC_API_KEY env + OrgSettings.aiModel.
 * 3. Null when neither is available — callers should gracefully pass.
 */
export async function getOrgLlmClient(
  organizationId: string
): Promise<{ client: LlmClient; model: string } | null> {
  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId },
  });

  if (settings?.defaultLlmProviderId) {
    const provider = await prisma.llmProvider.findFirst({
      where: {
        id: settings.defaultLlmProviderId,
        organizationId,
        status: "ACTIVE",
      },
    });
    if (provider) {
      return { client: getLlmClient(provider), model: provider.defaultModel };
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = getAnthropicClient();
    const model = settings?.aiModel || "claude-sonnet-4-20250514";
    const client: LlmClient = {
      async complete(req) {
        const response = await anthropic.messages.create({
          model: req.model,
          max_tokens: req.maxTokens ?? 2048,
          ...(req.system ? { system: req.system } : {}),
          messages: req.messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        });
        const block = response.content[0];
        if (!block || block.type !== "text") {
          throw new Error("Anthropic returned a non-text response");
        }
        return { text: block.text };
      },
      async agentTurn(req) {
        return anthropicAgentTurn(anthropic, req);
      },
      async agentTurnStream(req, onEvent) {
        return anthropicAgentTurnStream(anthropic, req, onEvent);
      },
      async testConnection() {
        return true;
      },
    };
    return { client, model };
  }

  return null;
}

/**
 * Resolve the LLM client for an agent-loop turn on a specific channel.
 * Prefers the channel's overrides, then falls back to the org-wide client.
 */
export async function getChannelLlmClient(channel: {
  organizationId: string;
  modelOverride: string | null;
  defaultLlmProviderId: string | null;
}): Promise<{ client: LlmClient; model: string } | null> {
  if (channel.defaultLlmProviderId) {
    const provider = await prisma.llmProvider.findFirst({
      where: {
        id: channel.defaultLlmProviderId,
        organizationId: channel.organizationId,
        status: "ACTIVE",
      },
    });
    if (provider) {
      return {
        client: getLlmClient(provider),
        model: channel.modelOverride || provider.defaultModel,
      };
    }
  }

  const orgClient = await getOrgLlmClient(channel.organizationId);
  if (!orgClient) return null;

  return {
    client: orgClient.client,
    model: channel.modelOverride || orgClient.model,
  };
}
