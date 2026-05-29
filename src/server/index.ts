import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { URL } from "url";
import { authenticateMcpToken, type AuthenticatedMember } from "./auth";
import { issuer } from "@/lib/oauth/urls";
import { buildToolListForMember, parseToolName, resolveConnectorBySlug } from "./tool-builder";
import { routeToolCall } from "./router";
import { checkPermissions } from "@/permissions/engine";
import { aiFilter } from "@/ai/filter";
import { createAuditLog } from "@/audit/logger";
import { createApprovalAndWait } from "@/approvals/queue";
import { getConnector } from "@/connectors/registry";
import { prisma } from "@/db";

// Active Streamable HTTP sessions, keyed by Mcp-Session-Id.
const sessions = new Map<
  string,
  { transport: StreamableHTTPServerTransport; membershipId: string }
>();

// Handles the MCP gateway routes. Mounted either by the standalone MCP server
// (startMcpServer, for `mcp:dev`) or by the unified Next.js server (server.ts).
export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse
) {
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;

  // CORS — clients send the session id and read it back from responses.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

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

  // Streamable HTTP transport: GET (SSE stream) / POST (JSON-RPC) / DELETE
  // (teardown) on /mcp/<orgSlug>.
  if (path.startsWith("/mcp/")) {
    await handleStreamableHttp(req, res, url);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

const slugFromPath = (path: string) =>
  path.slice("/mcp/".length).split("/")[0];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// RFC 9728 / RFC 6750: tell the client where to discover the auth server so it
// can start the OAuth flow.
function send401(req: IncomingMessage, res: ServerResponse, url: URL) {
  const slug = slugFromPath(url.pathname);
  const metadataUrl = `${issuer()}/.well-known/oauth-protected-resource/mcp/${slug}`;
  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="${metadataUrl}"`
  );
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Authorization required" }));
}

async function handleStreamableHttp(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  // Authenticate every request first. An unauthenticated request of ANY method
  // gets the OAuth discovery challenge (RFC 9728) so clients can start login —
  // not just POST. OAuth clients re-send the bearer token on every request.
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    send401(req, res, url);
    return;
  }
  const member = await authenticateMcpToken(token);
  if (!member) {
    send401(req, res, url);
    return;
  }

  // The path slug must match the token's org so a token can't be used against
  // another org's endpoint. Path: /mcp/<orgSlug>.
  const slug = slugFromPath(url.pathname);
  if (slug !== member.orgSlug) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "Token does not match this organization endpoint" })
    );
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session — route straight to its transport (GET / POST / DELETE).
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    await session.transport.handleRequest(req, res);
    return;
  }

  // No session id: only a POST initialize request can open one.
  if (req.method !== "POST") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing Mcp-Session-Id" }));
    return;
  }

  const raw = await readBody(req);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  if (!isInitializeRequest(body)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Expected initialize request" }));
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      sessions.set(sid, { transport, membershipId: member.id });
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  const mcpServer = createMcpServerForMember(member);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

export async function startMcpServer() {
  const port = Number(process.env.MCP_PORT || 3001);

  const httpServer = createServer(handleMcpRequest);

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
    const tools = await buildToolListForMember(member.id, member.orgSlug, member.organizationId);
    return { tools };
  });

  // Handle tools/call — full permission pipeline
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
    const { name, arguments: params } = request.params;
    const startTime = Date.now();

    try {
      const { connectorSlug, toolName } = parseToolName(name);
      const connector = await resolveConnectorBySlug(member.organizationId, connectorSlug);

      if (!connector) {
        throw new Error("Connector not found");
      }

      const connectorId = connector.id;
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

// Start if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer();
}
