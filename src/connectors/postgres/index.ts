import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionCheck,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";
import {
  classifyStatement,
  extractSqlTableRefs,
  isSystemTableRef,
  isTableRefAllowed,
  pgDenialReason,
  referencedTableKeys,
  resolvePgPermission,
  type PgPermissions,
  type PgSqlCategory,
} from "./permissions";

export class PostgresConnector implements ConnectorInstance {
  type = "POSTGRES";
  // Read/write is governed by native CRUD + per-table + per-member permissions,
  // not the coarse Layer-1 toggles.
  nativeReadWrite = true;

  listTools(_config: ConnectorConfig): Tool[] {
    return [
      {
        name: "pg_query",
        description:
          "Run a read-only SQL query. Use this for ALL reads \u2014 SELECT, " +
          "aggregations, joins, CTEs, EXPLAIN \u2014 and to inspect the database " +
          "by querying information_schema or pg_catalog (list tables, describe " +
          "columns, find foreign keys/indexes, row counts). Runs inside a " +
          "READ ONLY transaction.",
        inputSchema: {
          type: "object" as const,
          properties: {
            sql: {
              type: "string",
              description:
                "Read-only SQL: SELECT/WITH/EXPLAIN, or information_schema / " +
                "pg_catalog introspection.",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "pg_execute",
        description:
          "Execute a write SQL statement: INSERT, UPDATE, DELETE, or DDL " +
          "(CREATE/ALTER/DROP). Subject to the connector and member permissions.",
        inputSchema: {
          type: "object" as const,
          properties: {
            sql: {
              type: "string",
              description: "SQL statement: INSERT / UPDATE / DELETE / DDL.",
            },
          },
          required: ["sql"],
        },
      },
    ];
  }

  getNativePermissions(): NativePermissionDef[] {
    return [
      {
        key: "allowedSchemas",
        label: "Allowed Schemas",
        description: "Restrict access to specific schemas",
        type: "string[]",
        default: ["public"],
      },
      {
        key: "allowedTables",
        label: "Allowed Tables",
        description: "Restrict access to specific tables (empty = all)",
        type: "string[]",
        default: [],
      },
    ];
  }

  checkNativePermissions(
    toolName: string,
    params: Record<string, any>,
    perms: Record<string, any>,
    config?: ConnectorConfig
  ): NativePermissionCheck {
    const { allowedTables } = perms;

    // CRUD enforcement: classify the operation, then resolve it against the
    // permission layers (per-table > per-member > connector default > built-in
    // read-only). The global/member layer is checked first, then any per-table
    // overrides for tables the statement references.
    const category = this.operationCategory(toolName, params);
    const connectorDefaults = config?.permissions as PgPermissions | undefined;
    const memberOverrides = perms?.permissions as PgPermissions | undefined;
    const tablePermissions = (config?.tablePermissions ?? {}) as Record<
      string,
      PgPermissions
    >;

    if (!resolvePgPermission(category, connectorDefaults, memberOverrides)) {
      return { allowed: false, reason: pgDenialReason(category) };
    }

    // Per-table overrides (connector-wide). Only enforced for tables we can
    // identify in the call; unrecognized tables fall back to the check above.
    const configuredTableKeys = Object.keys(tablePermissions);
    if (configuredTableKeys.length > 0) {
      for (const key of this.referencedTables(
        toolName,
        params,
        configuredTableKeys
      )) {
        if (
          !resolvePgPermission(
            category,
            connectorDefaults,
            memberOverrides,
            tablePermissions[key]
          )
        ) {
          return { allowed: false, reason: pgDenialReason(category, key) };
        }
      }
    }

    // Per-member table access (whitelist): a member may only touch tables
    // explicitly granted to them, stored on perms.allowedTables as
    // `schema.table` keys. No grants = no data access at all.
    const dataTools = ["pg_query", "pg_execute"];
    if (dataTools.includes(toolName)) {
      const grantedTables: string[] = Array.isArray(allowedTables)
        ? allowedTables
        : [];
      if (grantedTables.length === 0) {
        return {
          allowed: false,
          reason: "This member hasn't been granted access to any tables",
        };
      }

      // Every user table the SQL touches must be within the granted set.
      // System catalog / information_schema references are exempt so the
      // member can still introspect database structure via pg_query.
      const referenced =
        typeof params.sql === "string"
          ? extractSqlTableRefs(params.sql).filter((r) => !isSystemTableRef(r))
          : [];
      for (const ref of referenced) {
        if (!isTableRefAllowed(ref, grantedTables)) {
          return {
            allowed: false,
            reason: `This member doesn't have access to table '${ref}'`,
          };
        }
      }
    }

    return { allowed: true };
  }

  getOperationType(toolName: string): "read" | "write" {
    return toolName === "pg_execute" ? "write" : "read";
  }

  /**
   * Map a tool call to a CRUD category for Layer-2 enforcement. Only
   * `pg_execute` can be a write; everything else is a read. The actual verb of
   * a `pg_execute` call comes from parsing its SQL.
   */
  private operationCategory(
    toolName: string,
    params: Record<string, any>
  ): PgSqlCategory {
    if (toolName === "pg_execute" && typeof params?.sql === "string") {
      return classifyStatement(params.sql);
    }
    return "read";
  }

  /**
   * Best-effort list of configured table keys a call targets, used to apply
   * per-table permission overrides. Not a SQL parser — matches table names as
   * whole identifiers and defers nuanced cases to the AI filter layer.
   */
  private referencedTables(
    toolName: string,
    params: Record<string, any>,
    configuredKeys: string[]
  ): string[] {
    if (
      (toolName === "pg_query" || toolName === "pg_execute") &&
      typeof params?.sql === "string"
    ) {
      return referencedTableKeys(params.sql, configuredKeys);
    }
    return [];
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    _config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult> {
    const client = new pg.Client({ connectionString: credentials.raw });
    try {
      await client.connect();

      switch (toolName) {
        case "pg_query": {
          // Enforce read-only via transaction to prevent writes through pg_query
          await client.query("BEGIN TRANSACTION READ ONLY");
          try {
            const result = await client.query(params.sql);
            await client.query("COMMIT");
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { rows: result.rows, rowCount: result.rowCount },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          }
        }

        case "pg_execute": {
          const result = await client.query(params.sql);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { rowCount: result.rowCount, command: result.command },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          };
      }
    } finally {
      await client.end();
    }
  }

  async testConnection(
    _config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean> {
    const client = new pg.Client({ connectionString: credentials.raw });
    try {
      await client.connect();
      await client.query("SELECT 1");
      return true;
    } catch {
      return false;
    } finally {
      await client.end();
    }
  }
}

export default new PostgresConnector();
