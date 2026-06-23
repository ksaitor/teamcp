import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { discoverOAuthServerInfo } from "@modelcontextprotocol/sdk/client/auth.js";
import { prisma } from "@/db";
import { decrypt } from "@/lib/crypto";
import { connectMcp, isAuthError, type ConnectOptions, type TransportKind } from "./client";
import { DbOAuthClientProvider } from "./oauth-provider";

export type AuthMode = "none" | "token" | "oauth";

export interface ProbeResult {
  authMode: AuthMode;
  transport: TransportKind;
  /** Present only when the server is authless (we could list tools immediately). */
  tools?: Tool[];
}

async function serverRequiresOAuth(serverUrl: string): Promise<boolean> {
  try {
    const info = await discoverOAuthServerInfo(serverUrl);
    return (
      !!info.authorizationServerMetadata?.authorization_endpoint ||
      !!info.resourceMetadata
    );
  } catch {
    return false;
  }
}

/**
 * Contact an MCP server with no credentials to determine how it authenticates.
 * Stateless — creates nothing. Authless servers also get their tools listed.
 */
export async function probeServer(serverUrl: string): Promise<ProbeResult> {
  try {
    const { client, transportKind, close } = await connectMcp({
      serverUrl,
      clientName: "teamcp-probe",
    });
    try {
      const { tools } = await client.listTools();
      return { authMode: "none", transport: transportKind, tools };
    } finally {
      await close();
    }
  } catch (err) {
    if (isAuthError(err)) {
      const authMode = (await serverRequiresOAuth(serverUrl)) ? "oauth" : "token";
      return { authMode, transport: "streamable-http" };
    }
    throw err;
  }
}

function connectOptionsForConnector(connector: {
  id: string;
  credentialsEncrypted: string;
  config: unknown;
}): ConnectOptions {
  const config = (connector.config ?? {}) as Record<string, any>;
  const serverUrl: string = config.serverUrl || decrypt(connector.credentialsEncrypted);
  const authMode: AuthMode = config.authMode ?? "none";

  const opts: ConnectOptions = {
    serverUrl,
    transport: config.transport,
    clientName: "teamcp-discovery",
  };
  if (authMode === "token") opts.token = decrypt(connector.credentialsEncrypted);
  if (authMode === "oauth") opts.authProvider = new DbOAuthClientProvider(connector.id);
  return opts;
}

/**
 * Connect to a stored connector, list its tools, and upsert them into
 * ConnectorTool. Existing `enabled` flags are preserved; new tools default to
 * enabled. The working transport is persisted back to config to skip future
 * detection.
 */
export async function discoverAndStoreTools(connectorId: string): Promise<Tool[]> {
  const connector = await prisma.connector.findUniqueOrThrow({
    where: { id: connectorId },
  });
  const config = (connector.config ?? {}) as Record<string, any>;

  const { client, transportKind, close } = await connectMcp(
    connectOptionsForConnector(connector)
  );
  try {
    const { tools } = await client.listTools();

    if (config.transport !== transportKind) {
      await prisma.connector.update({
        where: { id: connectorId },
        data: { config: { ...config, transport: transportKind } },
      });
    }

    for (const tool of tools) {
      await prisma.connectorTool.upsert({
        where: { connectorId_toolName: { connectorId, toolName: tool.name } },
        create: {
          connectorId,
          toolName: tool.name,
          description: tool.description ?? null,
          inputSchema: (tool.inputSchema as object) ?? undefined,
          enabled: true,
        },
        update: {
          description: tool.description ?? null,
          inputSchema: (tool.inputSchema as object) ?? undefined,
        },
      });
    }

    return tools;
  } finally {
    await close();
  }
}
