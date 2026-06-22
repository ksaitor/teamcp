import type {
  ConnectorInstance,
  ConnectorConfig,
  DecryptedCredentials,
  NativePermissionDef,
  ToolResult,
} from "../interface";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  parseAppCredentials,
  getValidAccessToken,
  xeroRequest,
} from "./client";

/** Map friendly camelCase line items to Xero's PascalCase shape. */
function mapLineItems(items: any[] | undefined): any[] {
  return (items ?? []).map((li) => ({
    Description: li.description,
    Quantity: li.quantity,
    UnitAmount: li.unitAmount,
    AccountCode: li.accountCode,
    TaxType: li.taxType,
    ItemCode: li.itemCode,
  }));
}

const lineItemSchema = {
  type: "array",
  description: "Line items",
  items: {
    type: "object",
    properties: {
      description: { type: "string" },
      quantity: { type: "number" },
      unitAmount: { type: "number", description: "Unit amount (price)" },
      accountCode: { type: "string", description: "Account code, e.g. 200" },
      taxType: { type: "string", description: "Tax type code, e.g. OUTPUT" },
      itemCode: { type: "string", description: "Inventory item code (optional)" },
    },
  },
} as const;

export class XeroConnector implements ConnectorInstance {
  type = "XERO";

  listTools(_config: ConnectorConfig): Tool[] {
    return [
      // --- Read ---
      {
        name: "xero_get_organisation",
        description: "Get details of the connected Xero organisation",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "xero_list_contacts",
        description: "List contacts (customers and suppliers)",
        inputSchema: {
          type: "object" as const,
          properties: {
            where: { type: "string", description: "Xero filter expression (optional)" },
            searchTerm: { type: "string", description: "Search by name/email (optional)" },
            page: { type: "number", description: "Page number (100 per page)" },
          },
        },
      },
      {
        name: "xero_get_contact",
        description: "Get a single contact by ID",
        inputSchema: {
          type: "object" as const,
          properties: { contactId: { type: "string" } },
          required: ["contactId"],
        },
      },
      {
        name: "xero_list_invoices",
        description: "List invoices and bills",
        inputSchema: {
          type: "object" as const,
          properties: {
            where: { type: "string", description: "Xero filter expression (optional)" },
            statuses: { type: "string", description: "Comma-separated statuses, e.g. AUTHORISED,PAID" },
            page: { type: "number", description: "Page number (100 per page)" },
          },
        },
      },
      {
        name: "xero_get_invoice",
        description: "Get a single invoice by ID",
        inputSchema: {
          type: "object" as const,
          properties: { invoiceId: { type: "string" } },
          required: ["invoiceId"],
        },
      },
      {
        name: "xero_list_bank_transactions",
        description: "List bank transactions (spent and received money)",
        inputSchema: {
          type: "object" as const,
          properties: {
            where: { type: "string", description: "Xero filter expression (optional)" },
            page: { type: "number", description: "Page number (100 per page)" },
          },
        },
      },
      {
        name: "xero_list_accounts",
        description: "List accounts from the chart of accounts",
        inputSchema: {
          type: "object" as const,
          properties: {
            where: { type: "string", description: "Xero filter expression (optional)" },
          },
        },
      },
      {
        name: "xero_list_payments",
        description: "List payments against invoices and bills",
        inputSchema: {
          type: "object" as const,
          properties: {
            where: { type: "string", description: "Xero filter expression (optional)" },
            page: { type: "number", description: "Page number (100 per page)" },
          },
        },
      },
      {
        name: "xero_list_manual_journals",
        description: "List manual journals",
        inputSchema: {
          type: "object" as const,
          properties: {
            where: { type: "string", description: "Xero filter expression (optional)" },
            page: { type: "number", description: "Page number (100 per page)" },
          },
        },
      },
      // --- Write ---
      {
        name: "xero_create_contact",
        description: "Create a new contact",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Contact name" },
            email: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            phone: { type: "string" },
          },
          required: ["name"],
        },
      },
      {
        name: "xero_update_contact",
        description: "Update an existing contact",
        inputSchema: {
          type: "object" as const,
          properties: {
            contactId: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            phone: { type: "string" },
          },
          required: ["contactId"],
        },
      },
      {
        name: "xero_create_invoice",
        description: "Create an invoice (ACCREC) or bill (ACCPAY)",
        inputSchema: {
          type: "object" as const,
          properties: {
            type: { type: "string", description: "ACCREC (sales) or ACCPAY (purchase)" },
            contactId: { type: "string" },
            lineItems: lineItemSchema,
            date: { type: "string", description: "Issue date, YYYY-MM-DD" },
            dueDate: { type: "string", description: "Due date, YYYY-MM-DD" },
            reference: { type: "string" },
            status: { type: "string", description: "DRAFT, SUBMITTED, or AUTHORISED (default DRAFT)" },
          },
          required: ["type", "contactId", "lineItems"],
        },
      },
      {
        name: "xero_create_bank_transaction",
        description: "Create a bank transaction (RECEIVE or SPEND)",
        inputSchema: {
          type: "object" as const,
          properties: {
            type: { type: "string", description: "RECEIVE or SPEND" },
            contactId: { type: "string" },
            bankAccountId: { type: "string", description: "AccountID of the bank account" },
            lineItems: lineItemSchema,
            date: { type: "string", description: "Date, YYYY-MM-DD" },
          },
          required: ["type", "contactId", "bankAccountId", "lineItems"],
        },
      },
      {
        name: "xero_create_payment",
        description: "Record a payment against an invoice or bill",
        inputSchema: {
          type: "object" as const,
          properties: {
            invoiceId: { type: "string" },
            accountId: { type: "string", description: "AccountID the payment is made from/to" },
            amount: { type: "number" },
            date: { type: "string", description: "Payment date, YYYY-MM-DD" },
          },
          required: ["invoiceId", "accountId", "amount", "date"],
        },
      },
      {
        name: "xero_create_manual_journal",
        description: "Create a manual journal",
        inputSchema: {
          type: "object" as const,
          properties: {
            narration: { type: "string" },
            date: { type: "string", description: "Date, YYYY-MM-DD" },
            status: { type: "string", description: "DRAFT or POSTED (default DRAFT)" },
            journalLines: {
              type: "array",
              description: "Journal lines (debits positive, credits negative)",
              items: {
                type: "object",
                properties: {
                  lineAmount: { type: "number" },
                  accountCode: { type: "string" },
                  description: { type: "string" },
                  taxType: { type: "string" },
                },
              },
            },
          },
          required: ["narration", "journalLines"],
        },
      },
    ];
  }

  getNativePermissions(): NativePermissionDef[] {
    return [
      {
        key: "scopes",
        label: "API Scopes",
        description: "Xero OAuth scopes granted to this connection",
        type: "string[]",
        default: [
          "accounting.contacts.read",
          "accounting.transactions.read",
          "accounting.settings.read",
        ],
      },
    ];
  }

  getOperationType(toolName: string): "read" | "write" {
    return /create|update|delete/.test(toolName) ? "write" : "read";
  }

  async executeTool(
    toolName: string,
    params: Record<string, any>,
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<ToolResult> {
    try {
      const connectorId = config._connectorId as string | undefined;
      if (!connectorId) {
        throw new Error("Xero connector is missing its connector id");
      }
      const tenantId = config.tenantId as string | undefined;
      if (!tenantId) {
        throw new Error("No Xero organisation selected for this connector yet");
      }

      const creds = parseAppCredentials(credentials.raw);
      const accessToken = await getValidAccessToken(connectorId, creds);
      const call = (
        o: Omit<Parameters<typeof xeroRequest>[0], "accessToken" | "tenantId">
      ) => xeroRequest({ accessToken, tenantId, ...o });

      const ok = (data: unknown): ToolResult => ({
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      });

      switch (toolName) {
        case "xero_get_organisation":
          return ok(await call({ method: "GET", path: "Organisation" }));

        case "xero_list_contacts":
          return ok(
            await call({
              method: "GET",
              path: "Contacts",
              query: { where: params.where, searchTerm: params.searchTerm, page: params.page },
            })
          );

        case "xero_get_contact":
          return ok(await call({ method: "GET", path: `Contacts/${params.contactId}` }));

        case "xero_list_invoices":
          return ok(
            await call({
              method: "GET",
              path: "Invoices",
              query: { where: params.where, Statuses: params.statuses, page: params.page },
            })
          );

        case "xero_get_invoice":
          return ok(await call({ method: "GET", path: `Invoices/${params.invoiceId}` }));

        case "xero_list_bank_transactions":
          return ok(
            await call({
              method: "GET",
              path: "BankTransactions",
              query: { where: params.where, page: params.page },
            })
          );

        case "xero_list_accounts":
          return ok(
            await call({ method: "GET", path: "Accounts", query: { where: params.where } })
          );

        case "xero_list_payments":
          return ok(
            await call({
              method: "GET",
              path: "Payments",
              query: { where: params.where, page: params.page },
            })
          );

        case "xero_list_manual_journals":
          return ok(
            await call({
              method: "GET",
              path: "ManualJournals",
              query: { where: params.where, page: params.page },
            })
          );

        case "xero_create_contact":
          return ok(
            await call({
              method: "POST",
              path: "Contacts",
              body: {
                Contacts: [
                  {
                    Name: params.name,
                    EmailAddress: params.email,
                    FirstName: params.firstName,
                    LastName: params.lastName,
                    ...(params.phone
                      ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: params.phone }] }
                      : {}),
                  },
                ],
              },
            })
          );

        case "xero_update_contact":
          return ok(
            await call({
              method: "POST",
              path: "Contacts",
              body: {
                Contacts: [
                  {
                    ContactID: params.contactId,
                    ...(params.name ? { Name: params.name } : {}),
                    ...(params.email ? { EmailAddress: params.email } : {}),
                    ...(params.firstName ? { FirstName: params.firstName } : {}),
                    ...(params.lastName ? { LastName: params.lastName } : {}),
                    ...(params.phone
                      ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: params.phone }] }
                      : {}),
                  },
                ],
              },
            })
          );

        case "xero_create_invoice":
          return ok(
            await call({
              method: "POST",
              path: "Invoices",
              body: {
                Invoices: [
                  {
                    Type: params.type,
                    Contact: { ContactID: params.contactId },
                    LineItems: mapLineItems(params.lineItems),
                    Date: params.date,
                    DueDate: params.dueDate,
                    Reference: params.reference,
                    Status: params.status ?? "DRAFT",
                  },
                ],
              },
            })
          );

        case "xero_create_bank_transaction":
          return ok(
            await call({
              method: "POST",
              path: "BankTransactions",
              body: {
                BankTransactions: [
                  {
                    Type: params.type,
                    Contact: { ContactID: params.contactId },
                    BankAccount: { AccountID: params.bankAccountId },
                    LineItems: mapLineItems(params.lineItems),
                    Date: params.date,
                  },
                ],
              },
            })
          );

        case "xero_create_payment":
          return ok(
            await call({
              method: "PUT",
              path: "Payments",
              body: {
                Payments: [
                  {
                    Invoice: { InvoiceID: params.invoiceId },
                    Account: { AccountID: params.accountId },
                    Amount: params.amount,
                    Date: params.date,
                  },
                ],
              },
            })
          );

        case "xero_create_manual_journal":
          return ok(
            await call({
              method: "POST",
              path: "ManualJournals",
              body: {
                ManualJournals: [
                  {
                    Narration: params.narration,
                    Date: params.date,
                    Status: params.status ?? "DRAFT",
                    JournalLines: (params.journalLines ?? []).map((jl: any) => ({
                      LineAmount: jl.lineAmount,
                      AccountCode: jl.accountCode,
                      Description: jl.description,
                      TaxType: jl.taxType,
                    })),
                  },
                ],
              },
            })
          );

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Xero error: ${error.message}` }],
        isError: true,
      };
    }
  }

  async testConnection(
    config: ConnectorConfig,
    credentials: DecryptedCredentials
  ): Promise<boolean> {
    try {
      const connectorId = config._connectorId as string | undefined;
      const tenantId = config.tenantId as string | undefined;
      if (!connectorId || !tenantId) return false;
      const creds = parseAppCredentials(credentials.raw);
      const accessToken = await getValidAccessToken(connectorId, creds);
      await xeroRequest({ accessToken, tenantId, method: "GET", path: "Organisation" });
      return true;
    } catch {
      return false;
    }
  }
}

export default new XeroConnector();
