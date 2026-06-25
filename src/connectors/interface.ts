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

/**
 * Result of a connector's native (Layer 2) permission check. The permission
 * engine attaches the `layer` tag, so connectors only say allow/deny + why —
 * keeping all of a connector's logic in its own directory with no dependency on
 * `src/permissions`.
 */
export interface NativePermissionCheck {
  allowed: boolean;
  reason?: string;
}

export interface ConnectorInstance {
  type: string;

  /**
   * When true, the connector governs read vs write itself (e.g. via native
   * CRUD permissions), so the engine's coarse Layer-1 read/write gate is
   * disabled for it and ALL of its tools are advertised regardless of the
   * member's readAccess/writeAccess flags — call-time native checks decide.
   */
  nativeReadWrite?: boolean;

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

  /**
   * Optional Layer 2 native permission check. Receives the member's saved
   * native-permission values (the ones described by `getNativePermissions`),
   * the incoming call, and the connector's own config (so connector-wide
   * defaults can be merged with per-member overrides). Omit it to allow
   * everything at this layer. Implementing it here keeps a connector's
   * enforcement co-located with its definition instead of living in a central
   * switch.
   */
  checkNativePermissions?(
    toolName: string,
    params: Record<string, any>,
    nativePermissions: Record<string, any>,
    config?: ConnectorConfig
  ): NativePermissionCheck;
}
