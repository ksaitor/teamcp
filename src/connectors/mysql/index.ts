import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export class MySQLConnector implements ConnectorInstance {
  type = "MYSQL";

  listTools(_config: ConnectorConfig): Tool[] {
    return [
      {
        name: "mysql_query",
        description: "Execute a read-only SQL query against the MySQL database",
        inputSchema: {
          type: "object" as const,
          properties: {
            sql: { type: "string", description: "SQL query to execute (SELECT only)" },
          },
          required: ["sql"],
        },
      },
      {
        name: "mysql_execute",
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
        name: "mysql_list_tables",
        description: "List all tables in the database",
        inputSchema: {
          type: "object" as const,
          properties: {
            schema: {
              type: "string",
              description: "Schema/database name (default: connection's database)",
            },
          },
        },
      },
      {
        name: "mysql_describe_table",
        description: "Get the schema/columns of a specific table",
        inputSchema: {
          type: "object" as const,
          properties: {
            table: { type: "string", description: "Table name" },
            schema: {
              type: "string",
              description: "Schema/database name (default: connection's database)",
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
        description: "Restrict access to specific schemas/databases",
        type: "string[]",
        default: [],
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
    return toolName === "mysql_execute" ? "write" : "read";
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    _config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult> {
    // Dynamic import to avoid requiring mysql2 when not used
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection(credentials.raw);
    try {
      switch (toolName) {
        case "mysql_query": {
          // Enforce read-only via a read-only transaction to prevent writes through mysql_query
          await connection.query("START TRANSACTION READ ONLY");
          try {
            const [rows] = await connection.query(params.sql);
            await connection.query("COMMIT");
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      rows,
                      rowCount: Array.isArray(rows) ? rows.length : 0,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (err) {
            await connection.query("ROLLBACK");
            throw err;
          }
        }

        case "mysql_execute": {
          const [result] = await connection.query(params.sql);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "mysql_list_tables": {
          const [rows] = params.schema
            ? await connection.query(
                `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
                [params.schema]
              )
            : await connection.query(
                `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`
              );
          return {
            content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
          };
        }

        case "mysql_describe_table": {
          const [rows] = params.schema
            ? await connection.query(
                `SELECT column_name, data_type, is_nullable, column_default
                 FROM information_schema.columns
                 WHERE table_schema = ? AND table_name = ?
                 ORDER BY ordinal_position`,
                [params.schema, params.table]
              )
            : await connection.query(
                `SELECT column_name, data_type, is_nullable, column_default
                 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = ?
                 ORDER BY ordinal_position`,
                [params.table]
              );
          return {
            content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          };
      }
    } finally {
      await connection.end();
    }
  }

  async testConnection(
    _config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean> {
    const mysql = await import("mysql2/promise");
    let connection;
    try {
      connection = await mysql.createConnection(credentials.raw);
      await connection.query("SELECT 1");
      return true;
    } catch {
      return false;
    } finally {
      await connection?.end();
    }
  }
}
