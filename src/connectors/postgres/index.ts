import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";

export class PostgresConnector implements ConnectorInstance {
  type = "POSTGRES";

  listTools(_config: ConnectorConfig): Tool[] {
    return [
      {
        name: "pg_query",
        description: "Execute a read-only SQL query against the PostgreSQL database",
        inputSchema: {
          type: "object" as const,
          properties: {
            sql: { type: "string", description: "SQL query to execute (SELECT only)" },
          },
          required: ["sql"],
        },
      },
      {
        name: "pg_execute",
        description: "Execute a write SQL statement (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP)",
        inputSchema: {
          type: "object" as const,
          properties: {
            sql: { type: "string", description: "SQL statement to execute" },
          },
          required: ["sql"],
        },
      },
      {
        name: "pg_list_tables",
        description: "List all tables in the database",
        inputSchema: {
          type: "object" as const,
          properties: {
            schema: {
              type: "string",
              description: "Schema name (default: public)",
            },
          },
        },
      },
      {
        name: "pg_describe_table",
        description: "Get the schema/columns of a specific table",
        inputSchema: {
          type: "object" as const,
          properties: {
            table: { type: "string", description: "Table name" },
            schema: {
              type: "string",
              description: "Schema name (default: public)",
            },
          },
          required: ["table"],
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

  getOperationType(toolName: string): "read" | "write" {
    return toolName === "pg_execute" ? "write" : "read";
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

        case "pg_list_tables": {
          const schema = params.schema || "public";
          const result = await client.query(
            `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
            [schema]
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
          };
        }

        case "pg_describe_table": {
          const schema = params.schema || "public";
          const result = await client.query(
            `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position`,
            [schema, params.table]
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
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
