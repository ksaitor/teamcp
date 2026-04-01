import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { URL } from "url";
import { authenticateMcpToken, type AuthenticatedMember } from "./auth";
import { buildToolListForMember, parseToolName } from "./tool-builder";
import { routeToolCall } from "./router";
import { checkPermissions } from "@/permissions/engine";
import { aiFilter } from "@/ai/filter";
import { createAuditLog } from "@/audit/logger";
import { createApprovalAndWait } from "@/approvals/queue";
import { getConnector } from "@/connectors/registry";
import { prisma } from "@/db";

const sessions = new Map<
  string,
  { transport: SSEServerTransport; membershipId: string }
>();

export async function startMcpServer() {
  const port = Number(process.env.MCP_PORT || 3001);

  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);
      const path = url.pathname;

      // CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (path === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // SSE endpoint: GET /mcp/:orgSlug
      if (req.method === "GET" && path.startsWith("/mcp/")) {
        await handleSseConnect(req, res, url);
        return;
      }

      // Message endpoint: POST /messages?sessionId=xxx
      if (req.method === "POST" && path === "/messages") {
        await handleMessage(req, res, url);
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  );

  httpServer.listen(port, () => {
    console.log(`MCP server listening on port ${port}`);
  });

  return httpServer;
}

function createMcpServerForMember(member: AuthenticatedMember) {
  const server = new Server(
    { name: `teamrouter-${member.orgSlug}`, version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // Handle tools/list
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await buildToolListForMember(member.id);
    return { tools };
  });

  // Handle tools/call — full permission pipeline
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
    const { name, arguments: params } = request.params;
    const startTime = Date.now();

    try {
      const { connectorId, toolName } = parseToolName(name);
      const connector = await prisma.connector.findFirst({
        where: { id: connectorId, organizationId: member.organizationId },
      });

      if (!connector) {
        throw new Error("Connector not found");
      }

      const connectorImpl = getConnector(connector.type);
      const operationType = connectorImpl.getOperationType(toolName);

      // Layers 1-3: Hard permission checks (before execution)
      const permResult = await checkPermissions({
        member,
        connectorId,
        connectorType: connector.type,
        toolName,
        params: params || {},
        operationType,
      });

      if (!permResult.allowed) {
        await createAuditLog({
          membershipId: member.id,
          connectorId,
          organizationId: member.organizationId,
          toolName,
          requestParams: params || {},
          responseSummary: `Denied: ${permResult.reason}`,
          aiDecision: "BLOCKED",
          durationMs: Date.now() - startTime,
        });

        return {
          content: [{ type: "text", text: `Permission denied: ${permResult.reason}` }],
          isError: true,
        };
      }

      // Execute the tool call
      const routeResult = await routeToolCall(name, params || {}, member);

      // Layer 4: AI filtering (after execution)
      const filterResult = await aiFilter({
        member,
        connectorId: routeResult.connectorId,
        connectorName: routeResult.connectorName,
        connectorType: routeResult.connectorType,
        toolName: routeResult.toolName,
        params: params || {},
        result: routeResult.result,
        operationType: routeResult.operationType,
      });

      const durationMs = Date.now() - startTime;

      // Handle approval queue for uncertain decisions
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
            requestParams: params || {},
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
          requestParams: params || {},
          responseSummary: routeResult.result.content[0]?.text?.substring(0, 1024),
          aiDecision: "QUEUED",
          aiReasoning: `${filterResult.reasoning} → Admin: ${approvalResult}`,
          durationMs: Date.now() - startTime,
        });

        if (approvalResult === "APPROVED") {
          return routeResult.result;
        }

        return {
          content: [{
            type: "text",
            text: approvalResult === "EXPIRED"
              ? "Request timed out awaiting admin approval."
              : "Request denied by admin.",
          }],
          isError: true,
        };
      }

      // Map filter decision to audit decision
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
        requestParams: params || {},
        responseSummary: filterResult.result.content[0]?.text?.substring(0, 1024),
        aiDecision: aiDecisionMap[filterResult.decision] || "SKIPPED",
        aiReasoning: filterResult.reasoning,
        durationMs,
      });

      return filterResult.result;
    } catch (error: any) {
      await createAuditLog({
        membershipId: member.id,
        connectorId: null,
        organizationId: member.organizationId,
        toolName: name,
        requestParams: params || {},
        responseSummary: `Error: ${error.message}`,
        aiDecision: "BLOCKED",
        durationMs: Date.now() - startTime,
      });

      return {
        content: [{ type: "text" as const, text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

async function handleSseConnect(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "Access token required. Authenticate at the admin panel first.",
      })
    );
    return;
  }

  const member = await authenticateMcpToken(token);
  if (!member) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid or expired access token" }));
    return;
  }

  const mcpServer = createMcpServerForMember(member);
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  sessions.set(sessionId, { transport, membershipId: member.id });

  res.on("close", () => {
    sessions.delete(sessionId);
  });

  await mcpServer.connect(transport);
}

async function handleMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "sessionId required" }));
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }

  await session.transport.handlePostMessage(req, res);
}

// Start if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer();
}
