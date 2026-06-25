import { prisma } from "@/db";
import { getConnector } from "@/connectors/registry";
import { checkPermissions } from "@/permissions/engine";
import { aiFilter } from "@/ai/filter";
import { createAuditLog } from "@/audit/logger";
import { createApprovalAndWait } from "@/approvals/queue";
import { extensions, type ToolCallEvent } from "@/extensions";
import type { ToolResult } from "@/connectors/interface";
import type { AuthenticatedMember } from "./auth";
import { resolveToolCall, buildMemberToolEntries } from "./tool-builder";
import { routeToolCall } from "./router";
import {
  isMetaTool,
  SEARCH_TOOLS,
  RUN_TOOL,
  rankTools,
  formatSearchResults,
} from "./tool-gateway";

function emitToolCall(event: ToolCallEvent) {
  if (!extensions.onToolCall) return;
  // Fire-and-forget: telemetry must never affect the tool-call result or latency.
  queueMicrotask(() => {
    try {
      extensions.onToolCall!(event);
    } catch {
      // swallow — wrappers are responsible for their own error handling
    }
  });
}

/**
 * Handle a tool gateway meta-tool call (`search_tools` / `run_tool`). Returns a
 * ToolResult when `name` is a meta-tool, or null otherwise so the caller falls
 * through to normal tool resolution.
 *
 * - `search_tools` ranks the member's authorized tools (the full, uncapped set)
 *   and returns the best matches with their schemas.
 * - `run_tool` forwards to the normal pipeline so all permission layers apply.
 */
export async function handleMetaToolCall(
  name: string,
  params: Record<string, any>,
  member: AuthenticatedMember
): Promise<ToolResult | null> {
  if (!isMetaTool(name)) return null;

  if (name === SEARCH_TOOLS) {
    const query = typeof params?.query === "string" ? params.query : "";
    const limit =
      typeof params?.limit === "number" && params.limit > 0
        ? Math.min(params.limit, 25)
        : 10;
    const entries = await buildMemberToolEntries(member.id, member.organizationId);
    const ranked = rankTools(
      query,
      entries.map((e) => ({ tool: e.tool, connectorName: e.connector.name })),
      limit
    );
    return {
      content: [{ type: "text", text: formatSearchResults(ranked.map((r) => r.tool)) }],
    };
  }

  if (name === RUN_TOOL) {
    const innerName = typeof params?.name === "string" ? params.name : "";
    if (!innerName) {
      return {
        content: [{ type: "text", text: "run_tool requires a 'name' argument." }],
        isError: true,
      };
    }
    const innerArgs =
      params?.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, any>)
        : {};
    // Recurse through the full permission/filter/audit pipeline.
    return executeToolForMember(innerName, innerArgs, member);
  }

  return null;
}

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
  // Tool gateway meta-tools short-circuit before normal resolution.
  const meta = await handleMetaToolCall(namespacedToolName, params, member);
  if (meta) return meta;

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
    const operationType = connectorImpl.getOperationType(
      toolName,
      connector.config as Record<string, any>
    );

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
      emitToolCall({
        organizationId: member.organizationId,
        membershipId: member.id,
        connectorId: connector.id,
        toolName,
        durationMs: Date.now() - startTime,
        status: "denied",
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

      emitToolCall({
        organizationId: member.organizationId,
        membershipId: member.id,
        connectorId: routeResult.connectorId,
        toolName: routeResult.toolName,
        durationMs: Date.now() - startTime,
        status: "queued",
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

    emitToolCall({
      organizationId: member.organizationId,
      membershipId: member.id,
      connectorId: routeResult.connectorId,
      toolName: routeResult.toolName,
      durationMs: Date.now() - startTime,
      status: filterResult.decision === "block" ? "filtered" : "ok",
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
    emitToolCall({
      organizationId: member.organizationId,
      membershipId: member.id,
      connectorId: null,
      toolName: namespacedToolName,
      durationMs: Date.now() - startTime,
      status: "error",
    });
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}
