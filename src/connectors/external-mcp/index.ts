import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class ExternalMcpConnector implements ConnectorInstance {
  type = "EXTERNAL_MCP";

  listTools(config: ConnectorConfig): Tool[] {
    // Tools are discovered dynamically and stored in ConnectorTool table
    // This returns empty — the MCP server uses the DB records instead
    return [];
  }

  getNativePermissions(): NativePermissionDef[] {
    // External MCP permissions are handled via tool cherry-picking
    return [];
  }

  getOperationType(_toolName: string): "read" | "write" {
    // Default to read — admin can override via custom scripts
    return "read";
  }

  async discoverTools(config: ConnectorConfig, credentials: DecryptedCredentials): Promise<Tool[]> {
    const serverUrl = config.serverUrl || credentials.raw;
    const transport = new SSEClientTransport(new URL(serverUrl));
    const client = new Client({ name: "teammcp-discovery", version: "1.0.0" });

    try {
      await client.connect(transport);
      const result = await client.listTools();
      return result.tools;
    } finally {
      await client.close();
    }
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult> {
    const serverUrl = config.serverUrl || credentials.raw;
    const transport = new SSEClientTransport(new URL(serverUrl));
    const client = new Client({ name: "teammcp-proxy", version: "1.0.0" });

    try {
      await client.connect(transport);
      const result = await client.callTool({ name: toolName, arguments: params });

      return {
        content: (result.content as any[]) || [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
        isError: result.isError as boolean | undefined,
      };
    } finally {
      await client.close();
    }
  }

  async testConnection(
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean> {
    try {
      const tools = await this.discoverTools(config, credentials);
      return tools.length >= 0; // Even 0 tools is a valid connection
    } catch {
      return false;
    }
  }
}
