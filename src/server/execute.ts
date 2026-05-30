import { prisma } from "@/db";
import { getConnector } from "@/connectors/registry";
import { checkPermissions } from "@/permissions/engine";
import { aiFilter } from "@/ai/filter";
import { createAuditLog } from "@/audit/logger";
import { createApprovalAndWait } from "@/approvals/queue";
import type { ToolResult } from "@/connectors/interface";
import type { AuthenticatedMember } from "./auth";
import { resolveToolCall } from "./tool-builder";
import { routeToolCall } from "./router";

/**
 * Run the full tool-call pipeline (permission layers 1-3, execute, AI filter,
 * approval queue, audit log) for a member. Shared between the MCP gateway and
 * the channels agent loop so both surfaces enforce identical authorization.
 */
export async function executeToolForMember(
  namespacedToolName: string,
  params: Record<string, any>,
  member: AuthenticatedMember
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    const resolved = await resolveToolCall(
      member.id,
      member.organizationId,
      namespacedToolName
    );
    if (!resolved) {
      throw new Error("Tool not found");
    }

    const { connector, toolName } = resolved;
    const connectorImpl = getConnector(connector.type);
    const operationType = connectorImpl.getOperationType(toolName);

    // Layers 1-3 — hard permission checks.
    const permResult = await checkPermissions({
      member,
      connectorId: connector.id,
      connectorType: connector.type,
      toolName,
      params,
      operationType,
    });

    if (!permResult.allowed) {
      await createAuditLog({
        membershipId: member.id,
        connectorId: connector.id,
        organizationId: member.organizationId,
        toolName,
        requestParams: params,
        responseSummary: `Denied: ${permResult.reason}`,
        aiDecision: "BLOCKED",
        durationMs: Date.now() - startTime,
      });
      return {
        content: [
          { type: "text", text: `Permission denied: ${permResult.reason}` },
        ],
        isError: true,
      };
    }

    const routeResult = await routeToolCall(namespacedToolName, params, member);

    // Layer 4 — AI filter.
    const filterResult = await aiFilter({
      member,
      connectorId: routeResult.connectorId,
      connectorName: routeResult.connectorName,
      connectorType: routeResult.connectorType,
      toolName: routeResult.toolName,
      params,
      result: routeResult.result,
      operationType: routeResult.operationType,
    });

    if (filterResult.decision === "uncertain") {
      const settings = await prisma.orgSettings.findUnique({
        where: { organizationId: member.organizationId },
      });
      const timeoutSecs = settings?.approvalTimeoutSecs || 300;

      const approvalResult = await createApprovalAndWait(
        {
          membershipId: member.id,
          organizationId: member.organizationId,
          connectorName: routeResult.connectorName,
          toolName: routeResult.toolName,
          requestParams: params,
          responseData: routeResult.result.content[0]?.text || "",
          aiReasoning: filterResult.reasoning,
        },
        timeoutSecs
      );

      await createAuditLog({
        membershipId: member.id,
        connectorId: routeResult.connectorId,
        organizationId: member.organizationId,
        toolName: routeResult.toolName,
        requestParams: params,
        responseSummary: routeResult.result.content[0]?.text?.substring(0, 1024),
        aiDecision: "QUEUED",
        aiReasoning: `${filterResult.reasoning} → Admin: ${approvalResult}`,
        durationMs: Date.now() - startTime,
      });

      if (approvalResult === "APPROVED") return routeResult.result;
      return {
        content: [
          {
            type: "text",
            text:
              approvalResult === "EXPIRED"
                ? "Request timed out awaiting admin approval."
                : "Request denied by admin.",
          },
        ],
        isError: true,
      };
    }

    const aiDecisionMap = {
      pass: "PASSED",
      filter: "FILTERED",
      block: "BLOCKED",
      uncertain: "QUEUED",
    } as const;

    await createAuditLog({
      membershipId: member.id,
      connectorId: routeResult.connectorId,
      organizationId: member.organizationId,
      toolName: routeResult.toolName,
      requestParams: params,
      responseSummary: filterResult.result.content[0]?.text?.substring(0, 1024),
      aiDecision: aiDecisionMap[filterResult.decision] || "SKIPPED",
      aiReasoning: filterResult.reasoning,
      durationMs: Date.now() - startTime,
    });

    return filterResult.result;
  } catch (error: any) {
    await createAuditLog({
      membershipId: member.id,
      connectorId: null,
      organizationId: member.organizationId,
      toolName: namespacedToolName,
      requestParams: params,
      responseSummary: `Error: ${error.message}`,
      aiDecision: "BLOCKED",
      durationMs: Date.now() - startTime,
    });
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}
