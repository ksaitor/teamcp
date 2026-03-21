import { prisma } from "@/db";
import { getAnthropicClient } from "./client";
import { buildFilterPrompt } from "./prompts";
import { getCacheKey, getCachedDecision, setCachedDecision } from "./cache";
import type { AuthenticatedMember } from "@/server/auth";
import type { ToolResult } from "@/connectors/interface";

export interface AiFilterResult {
  decision: "pass" | "filter" | "block" | "uncertain";
  reasoning: string;
  filteredData?: string;
  result: ToolResult;
}

interface AiFilterInput {
  member: AuthenticatedMember;
  connectorId: string;
  connectorName: string;
  connectorType: string;
  toolName: string;
  params: Record<string, any>;
  result: ToolResult;
  operationType: "read" | "write";
}

/**
 * Layer 4: AI-powered response filtering.
 * Uses Claude to evaluate whether data should be shared with the member.
 */
export async function aiFilter(input: AiFilterInput): Promise<AiFilterResult> {
  // Load org settings
  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId: input.member.organizationId },
  });

  if (!settings?.aiFilterEnabled) {
    return { decision: "pass", reasoning: "AI filter disabled", result: input.result };
  }

  // Check if connector has AI filter disabled
  const connector = await prisma.connector.findUnique({
    where: { id: input.connectorId },
  });
  if (connector?.skipAiFilter) {
    return { decision: "pass", reasoning: "AI filter skipped for this connector", result: input.result };
  }

  // Load connector-specific AI instructions
  const access = await prisma.memberConnectorAccess.findUnique({
    where: {
      membershipId_connectorId: {
        membershipId: input.member.id,
        connectorId: input.connectorId,
      },
    },
  });

  const memberPermissions = input.member.permissionInstructions || "";
  const connectorPermissions = access?.aiInstructions || "";

  // If no permission instructions are set, skip AI filter
  if (!memberPermissions && !connectorPermissions) {
    return { decision: "pass", reasoning: "No AI filtering rules configured", result: input.result };
  }

  // Check cache
  const responseText = input.result.content
    .map((c) => c.text)
    .join("\n");
  const cacheKey = getCacheKey(
    `${memberPermissions}|${connectorPermissions}`,
    input.toolName,
    JSON.stringify(input.params)
  );
  const cached = getCachedDecision(cacheKey);
  if (cached && cached.decision === "pass") {
    // Only use cache for "pass" decisions — filter/block/uncertain need fresh evaluation
    return { decision: "pass", reasoning: "Cached: " + cached.reasoning, result: input.result };
  }

  // Call Claude
  try {
    const client = getAnthropicClient();
    const prompt = buildFilterPrompt({
      memberName: input.member.name,
      memberEmail: input.member.email,
      memberPermissions,
      connectorName: input.connectorName,
      connectorType: input.connectorType,
      connectorPermissions,
      toolName: input.toolName,
      requestParams: input.params,
      responseData: responseText.substring(0, 8000), // Limit context
      isWriteOperation: input.operationType === "write",
    });

    const response = await client.messages.create({
      model: settings.aiModel || "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const responseContent = response.content[0];
    if (responseContent.type !== "text") {
      return { decision: "pass", reasoning: "AI returned non-text response", result: input.result };
    }

    // Parse AI response
    const aiResponse = parseAiResponse(responseContent.text);

    // Cache the decision
    setCachedDecision(cacheKey, {
      decision: aiResponse.decision,
      reasoning: aiResponse.reasoning,
      filteredData: aiResponse.filteredData,
      cachedAt: Date.now(),
    });

    // Build filtered result
    if (aiResponse.decision === "filter" && aiResponse.filteredData) {
      return {
        ...aiResponse,
        result: {
          content: [{ type: "text", text: aiResponse.filteredData }],
        },
      };
    }

    if (aiResponse.decision === "block") {
      return {
        ...aiResponse,
        result: {
          content: [
            {
              type: "text",
              text: `Access denied: ${aiResponse.reasoning}`,
            },
          ],
          isError: true,
        },
      };
    }

    return { ...aiResponse, result: input.result };
  } catch (error: any) {
    // AI failure — fall back to passing (hard permissions already checked)
    console.error("AI filter error:", error.message);
    return {
      decision: "pass",
      reasoning: `AI filter unavailable: ${error.message}. Falling back to hard permissions.`,
      result: input.result,
    };
  }
}

function parseAiResponse(text: string): {
  decision: "pass" | "filter" | "block" | "uncertain";
  reasoning: string;
  filteredData?: string;
} {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        decision: parsed.decision || "pass",
        reasoning: parsed.reasoning || "No reasoning provided",
        filteredData: parsed.filteredData,
      };
    }
  } catch {
    // JSON parse failed
  }

  // Fallback: try to detect decision from text
  const lower = text.toLowerCase();
  if (lower.includes("block")) {
    return { decision: "block", reasoning: text.substring(0, 200) };
  }
  if (lower.includes("filter")) {
    return { decision: "filter", reasoning: text.substring(0, 200) };
  }
  if (lower.includes("uncertain")) {
    return { decision: "uncertain", reasoning: text.substring(0, 200) };
  }
  return { decision: "pass", reasoning: "AI response could not be parsed" };
}
