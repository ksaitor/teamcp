import type { IconType } from "react-icons";
import {
  FiDatabase,
  FiServer,
  FiBarChart2,
  FiGlobe,
  FiTrendingUp,
} from "react-icons/fi";
import {
  SiMongodb,
  SiMysql,
  SiStripe,
  SiSnowflake,
  SiCloudflare,
} from "react-icons/si";

export type ConnectorType =
  | "POSTGRES"
  | "MYSQL"
  | "MONGODB"
  | "STRIPE"
  | "EXTERNAL_MCP"
  | "WEB_REQUEST"
  | "CUSTOM";

export interface CredentialField {
  label: string;
  inputType: "password" | "url";
  placeholder: string;
  /** When set, the entered value is also written to config[configKey]. */
  configKey?: string;
}

/**
 * Pre-configured external MCP server. When present on an EXTERNAL_MCP entry, the
 * custom-MCP wizard skips asking for a URL and connects straight to this server
 * (auth — usually OAuth — is still auto-detected on connect).
 */
export interface McpPreset {
  serverUrl: string;
  defaultName: string;
}

export interface ConnectorCatalogEntry {
  slug: string;
  type: ConnectorType;
  label: string;
  description: string;
  icon: IconType;
  available: boolean;
  credentialField?: CredentialField;
  /** Set on EXTERNAL_MCP entries that point at a known hosted MCP server. */
  mcpPreset?: McpPreset;
}

export const connectorCatalog: ConnectorCatalogEntry[] = [
  {
    slug: "custom-mcp",
    type: "EXTERNAL_MCP",
    label: "Custom MCP Server",
    description: "Connect any external MCP server by URL.",
    icon: FiServer,
    available: true,
    credentialField: {
      label: "Server URL",
      inputType: "url",
      placeholder: "https://mcp-server.example.com",
      configKey: "serverUrl",
    },
  },
  {
    slug: "cloudflare",
    type: "EXTERNAL_MCP",
    label: "Cloudflare",
    description:
      "Manage Cloudflare via its hosted MCP server — DNS, Workers, R2, Zero Trust, and 2,500+ API endpoints.",
    icon: SiCloudflare,
    available: true,
    mcpPreset: {
      serverUrl: "https://mcp.cloudflare.com/mcp",
      defaultName: "Cloudflare",
    },
  },
  {
    slug: "ahrefs",
    type: "EXTERNAL_MCP",
    label: "Ahrefs",
    description:
      "Pull live SEO data from Ahrefs via its hosted MCP server — backlinks, organic keywords, rank tracking, site audits, and Web Analytics.",
    icon: FiTrendingUp,
    available: true,
    mcpPreset: {
      serverUrl: "https://api.ahrefs.com/mcp/mcp",
      defaultName: "Ahrefs",
    },
  },
  {
    slug: "web-request",
    type: "WEB_REQUEST",
    label: "Web Request",
    description:
      "Call any HTTP endpoint — REST APIs, internal services, lookups.",
    icon: FiGlobe,
    available: true,
  },
  {
    slug: "postgres",
    type: "POSTGRES",
    label: "PostgreSQL",
    description: "Connect a PostgreSQL database via connection string.",
    icon: FiDatabase,
    available: true,
    credentialField: {
      label: "Connection string",
      inputType: "password",
      placeholder: "postgresql://user:pass@host:5432/db",
    },
  },
  {
    slug: "mysql",
    type: "MYSQL",
    label: "MySQL",
    description: "Connect a MySQL database via connection string.",
    icon: SiMysql,
    available: true,
    credentialField: {
      label: "Connection string",
      inputType: "password",
      placeholder: "mysql://user:pass@host:3306/db",
    },
  },
  {
    slug: "mongodb",
    type: "MONGODB",
    label: "MongoDB",
    description: "Connect a MongoDB database via connection string.",
    icon: SiMongodb,
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
    icon: SiStripe,
    available: true,
    credentialField: {
      label: "API key",
      inputType: "password",
      placeholder: "sk_live_...",
    },
  },
  {
    slug: "google-analytics",
    type: "CUSTOM",
    label: "Google Analytics",
    description: "Query traffic and conversion data from GA4.",
    icon: FiBarChart2,
    available: false,
  },
  {
    slug: "snowflake",
    type: "CUSTOM",
    label: "Snowflake",
    description: "Run queries against your Snowflake warehouse.",
    icon: SiSnowflake,
    available: false,
  },
];

export function getCatalogEntry(
  slug: string
): ConnectorCatalogEntry | undefined {
  return connectorCatalog.find((entry) => entry.slug === slug);
}
