import {
  Database,
  Leaf,
  CreditCard,
  Server,
  BarChart3,
  Snowflake,
  type LucideIcon,
} from "lucide-react";

export type ConnectorType =
  | "POSTGRES"
  | "MONGODB"
  | "STRIPE"
  | "EXTERNAL_MCP"
  | "CUSTOM";

export interface CredentialField {
  label: string;
  inputType: "password" | "url";
  placeholder: string;
  /** When set, the entered value is also written to config[configKey]. */
  configKey?: string;
}

export interface ConnectorCatalogEntry {
  slug: string;
  type: ConnectorType;
  label: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
  credentialField?: CredentialField;
}

export const connectorCatalog: ConnectorCatalogEntry[] = [
  {
    slug: "postgres",
    type: "POSTGRES",
    label: "PostgreSQL",
    description: "Connect a PostgreSQL database via connection string.",
    icon: Database,
    available: true,
    credentialField: {
      label: "Connection string",
      inputType: "password",
      placeholder: "postgresql://user:pass@host:5432/db",
    },
  },
  {
    slug: "mongodb",
    type: "MONGODB",
    label: "MongoDB",
    description: "Connect a MongoDB database via connection string.",
    icon: Leaf,
    available: true,
    credentialField: {
      label: "Connection string",
      inputType: "password",
      placeholder: "mongodb://user:pass@host:27017/db",
    },
  },
  {
    slug: "stripe",
    type: "STRIPE",
    label: "Stripe",
    description: "Read payments, customers, and subscriptions from Stripe.",
    icon: CreditCard,
    available: true,
    credentialField: {
      label: "API key",
      inputType: "password",
      placeholder: "sk_live_...",
    },
  },
  {
    slug: "custom-mcp",
    type: "EXTERNAL_MCP",
    label: "Custom MCP Server",
    description: "Connect any external MCP server by URL.",
    icon: Server,
    available: true,
    credentialField: {
      label: "Server URL",
      inputType: "url",
      placeholder: "https://mcp-server.example.com",
      configKey: "serverUrl",
    },
  },
  {
    slug: "google-analytics",
    type: "CUSTOM",
    label: "Google Analytics",
    description: "Query traffic and conversion data from GA4.",
    icon: BarChart3,
    available: false,
  },
  {
    slug: "mysql",
    type: "CUSTOM",
    label: "MySQL",
    description: "Connect a MySQL database via connection string.",
    icon: Database,
    available: false,
  },
  {
    slug: "snowflake",
    type: "CUSTOM",
    label: "Snowflake",
    description: "Run queries against your Snowflake warehouse.",
    icon: Snowflake,
    available: false,
  },
];

export function getCatalogEntry(
  slug: string
): ConnectorCatalogEntry | undefined {
  return connectorCatalog.find((entry) => entry.slug === slug);
}
