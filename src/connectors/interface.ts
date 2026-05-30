import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface ConnectorConfig {
  [key: string]: any;
}

export interface DecryptedCredentials {
  raw: string;
}

export interface NativePermissionDef {
  key: string;
  label: string;
  description: string;
  type: "boolean" | "string[]" | "string";
  default?: any;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ConnectorInstance {
  type: string;

  /** Return MCP tools this connector exposes */
  listTools(config: ConnectorConfig): Tool[];

  /** Return available native permission definitions */
  getNativePermissions(): NativePermissionDef[];

  /** Execute a tool call */
  executeTool(
    toolName: string,
    params: Record<string, any>,
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult>;

  /** Test if credentials/config are valid */
  testConnection(
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean>;

  /** Classify a tool call as read or write */
  getOperationType(toolName: string, config?: ConnectorConfig): "read" | "write";
}
