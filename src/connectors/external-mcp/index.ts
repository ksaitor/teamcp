import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { connectMcp, type ConnectOptions } from "./client";
import { DbOAuthClientProvider } from "./oauth-provider";

type AuthMode = "none" | "token" | "oauth";

export class ExternalMcpConnector implements ConnectorInstance {
  type = "EXTERNAL_MCP";

  listTools(_config: ConnectorConfig): Tool[] {
    // Tools are discovered dynamically and stored in the ConnectorTool table;
    // the gateway reads those records instead of calling this.
    return [];
  }

  getNativePermissions(): NativePermissionDef[] {
    return [];
  }

  getOperationType(_toolName: string): "read" | "write" {
    return "read";
  }

  private connectOptions(
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): ConnectOptions {
    const serverUrl: string = config.serverUrl || credentials.raw;
    const authMode: AuthMode = config.authMode ?? "none";

    const opts: ConnectOptions = {
      serverUrl,
      transport: config.transport,
      clientName: "teamcp-proxy",
    };
    if (authMode === "token") opts.token = credentials.raw;
    if (authMode === "oauth") {
      if (!config._connectorId) {
        throw new Error("OAuth connector is missing _connectorId in config");
      }
      opts.authProvider = new DbOAuthClientProvider(config._connectorId);
    }
    return opts;
  }

  async discoverTools(
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<Tool[]> {
    const { client, close } = await connectMcp(
      this.connectOptions(config, credentials)
    );
    try {
      const result = await client.listTools();
      return result.tools;
    } finally {
      await close();
    }
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult> {
    const { client, close } = await connectMcp(
      this.connectOptions(config, credentials)
    );
    try {
      const result = await client.callTool({ name: toolName, arguments: params });
      return {
        content: (result.content as any[]) || [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
        isError: result.isError as boolean | undefined,
      };
    } finally {
      await close();
    }
  }

  async testConnection(
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean> {
    try {
      await this.discoverTools(config, credentials);
      return true;
    } catch {
      return false;
    }
  }
}

export default new ExternalMcpConnector();
