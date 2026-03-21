import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export class StripeConnector implements ConnectorInstance {
  type = "STRIPE";

  listTools(_config: ConnectorConfig): Tool[] {
    return [
      {
        name: "stripe_list_customers",
        description: "List Stripe customers",
        inputSchema: {
          type: "object" as const,
          properties: {
            limit: { type: "number", description: "Max results (default: 10)" },
            email: { type: "string", description: "Filter by email" },
          },
        },
      },
      {
        name: "stripe_get_customer",
        description: "Get a specific Stripe customer by ID",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string", description: "Customer ID (cus_...)" },
          },
          required: ["id"],
        },
      },
      {
        name: "stripe_list_charges",
        description: "List recent charges",
        inputSchema: {
          type: "object" as const,
          properties: {
            limit: { type: "number", description: "Max results (default: 10)" },
            customer: { type: "string", description: "Filter by customer ID" },
          },
        },
      },
      {
        name: "stripe_get_invoice",
        description: "Get a specific invoice by ID",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string", description: "Invoice ID (in_...)" },
          },
          required: ["id"],
        },
      },
      {
        name: "stripe_list_subscriptions",
        description: "List subscriptions",
        inputSchema: {
          type: "object" as const,
          properties: {
            limit: { type: "number", description: "Max results (default: 10)" },
            customer: { type: "string", description: "Filter by customer ID" },
            status: { type: "string", description: "Filter by status" },
          },
        },
      },
      {
        name: "stripe_create_refund",
        description: "Create a refund for a charge",
        inputSchema: {
          type: "object" as const,
          properties: {
            charge: { type: "string", description: "Charge ID (ch_...)" },
            amount: { type: "number", description: "Amount in cents (omit for full refund)" },
            reason: { type: "string", description: "Reason for refund" },
          },
          required: ["charge"],
        },
      },
      {
        name: "stripe_update_customer",
        description: "Update a customer's information",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string", description: "Customer ID" },
            name: { type: "string" },
            email: { type: "string" },
            metadata: { type: "object", additionalProperties: true },
          },
          required: ["id"],
        },
      },
    ];
  }

  getNativePermissions(): NativePermissionDef[] {
    return [
      {
        key: "scopes",
        label: "API Scopes",
        description: "Allowed Stripe API scopes",
        type: "string[]",
        default: [
          "read:customers",
          "read:charges",
          "read:invoices",
          "read:subscriptions",
        ],
      },
    ];
  }

  getOperationType(toolName: string): "read" | "write" {
    return toolName.includes("create") || toolName.includes("update")
      ? "write"
      : "read";
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    _config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult> {
    // Dynamic import
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(credentials.raw);

    try {
      switch (toolName) {
        case "stripe_list_customers": {
          const customers = await stripe.customers.list({
            limit: params.limit || 10,
            email: params.email,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(customers.data, null, 2) }],
          };
        }

        case "stripe_get_customer": {
          const customer = await stripe.customers.retrieve(params.id);
          return {
            content: [{ type: "text", text: JSON.stringify(customer, null, 2) }],
          };
        }

        case "stripe_list_charges": {
          const charges = await stripe.charges.list({
            limit: params.limit || 10,
            customer: params.customer,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(charges.data, null, 2) }],
          };
        }

        case "stripe_get_invoice": {
          const invoice = await stripe.invoices.retrieve(params.id);
          return {
            content: [{ type: "text", text: JSON.stringify(invoice, null, 2) }],
          };
        }

        case "stripe_list_subscriptions": {
          const subs = await stripe.subscriptions.list({
            limit: params.limit || 10,
            customer: params.customer,
            status: params.status as any,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(subs.data, null, 2) }],
          };
        }

        case "stripe_create_refund": {
          const refund = await stripe.refunds.create({
            charge: params.charge,
            amount: params.amount,
            reason: params.reason as any,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(refund, null, 2) }],
          };
        }

        case "stripe_update_customer": {
          const { id, ...updateData } = params;
          const customer = await stripe.customers.update(id, updateData);
          return {
            content: [{ type: "text", text: JSON.stringify(customer, null, 2) }],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Stripe error: ${error.message}` }],
        isError: true,
      };
    }
  }

  async testConnection(
    _config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean> {
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(credentials.raw);
      await stripe.customers.list({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
