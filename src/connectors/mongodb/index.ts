import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionCheck,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export class MongoDBConnector implements ConnectorInstance {
  type = "MONGODB";

  listTools(_config: ConnectorConfig): Tool[] {
    return [
      {
        name: "mongo_find",
        description: "Query documents from a MongoDB collection",
        inputSchema: {
          type: "object" as const,
          properties: {
            collection: { type: "string", description: "Collection name" },
            filter: {
              type: "object",
              description: "MongoDB query filter (JSON)",
              additionalProperties: true,
            },
            limit: {
              type: "number",
              description: "Max documents to return (default: 20)",
            },
          },
          required: ["collection"],
        },
      },
      {
        name: "mongo_list_collections",
        description: "List all collections in the database",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "mongo_insert",
        description: "Insert a document into a collection",
        inputSchema: {
          type: "object" as const,
          properties: {
            collection: { type: "string", description: "Collection name" },
            document: {
              type: "object",
              description: "Document to insert",
              additionalProperties: true,
            },
          },
          required: ["collection", "document"],
        },
      },
      {
        name: "mongo_update",
        description: "Update documents in a collection",
        inputSchema: {
          type: "object" as const,
          properties: {
            collection: { type: "string", description: "Collection name" },
            filter: { type: "object", description: "Query filter", additionalProperties: true },
            update: { type: "object", description: "Update operations", additionalProperties: true },
          },
          required: ["collection", "filter", "update"],
        },
      },
      {
        name: "mongo_delete",
        description: "Delete documents from a collection",
        inputSchema: {
          type: "object" as const,
          properties: {
            collection: { type: "string", description: "Collection name" },
            filter: { type: "object", description: "Query filter", additionalProperties: true },
          },
          required: ["collection", "filter"],
        },
      },
    ];
  }

  getNativePermissions(): NativePermissionDef[] {
    return [
      {
        key: "allowedCollections",
        label: "Allowed Collections",
        description: "Restrict access to specific collections (empty = all)",
        type: "string[]",
        default: [],
      },
    ];
  }

  checkNativePermissions(
    _toolName: string,
    params: Record<string, any>,
    perms: Record<string, any>
  ): NativePermissionCheck {
    const { allowedCollections } = perms;

    if (
      allowedCollections &&
      allowedCollections.length > 0 &&
      params.collection
    ) {
      if (!allowedCollections.includes(params.collection)) {
        return {
          allowed: false,
          reason: `Collection '${params.collection}' is not in the allowed collections list`,
        };
      }
    }

    return { allowed: true };
  }

  getOperationType(toolName: string): "read" | "write" {
    return toolName === "mongo_find" || toolName === "mongo_list_collections"
      ? "read"
      : "write";
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    _config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult> {
    // Dynamic import to avoid requiring mongodb when not used
    // @ts-ignore — optional connector dependency, may be absent at type-check time
    const { MongoClient } = await import(/* turbopackOptional: true */ "mongodb");
    const client = new MongoClient(credentials.raw);

    try {
      await client.connect();
      const db = client.db();

      switch (toolName) {
        case "mongo_find": {
          const docs = await db
            .collection(params.collection)
            .find(params.filter || {})
            .limit(params.limit || 20)
            .toArray();
          return {
            content: [{ type: "text", text: JSON.stringify(docs, null, 2) }],
          };
        }

        case "mongo_list_collections": {
          const collections = await db.listCollections().toArray();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  collections.map((c) => c.name),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "mongo_insert": {
          const result = await db
            .collection(params.collection)
            .insertOne(params.document);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ insertedId: result.insertedId }, null, 2),
              },
            ],
          };
        }

        case "mongo_update": {
          const result = await db
            .collection(params.collection)
            .updateMany(params.filter, params.update);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "mongo_delete": {
          const result = await db
            .collection(params.collection)
            .deleteMany(params.filter);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { deletedCount: result.deletedCount },
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
      await client.close();
    }
  }

  async testConnection(
    _config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean> {
    // @ts-ignore — optional connector dependency, may be absent at type-check time
    const { MongoClient } = await import(/* turbopackOptional: true */ "mongodb");
    const client = new MongoClient(credentials.raw);
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      return true;
    } catch {
      return false;
    } finally {
      await client.close();
    }
  }
}

export default new MongoDBConnector();
