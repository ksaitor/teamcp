import type { ConnectorInstance } from "./interface";
import { PostgresConnector } from "./postgres";
import { MongoDBConnector } from "./mongodb";
import { StripeConnector } from "./stripe";
import { ExternalMcpConnector } from "./external-mcp";
import { WebRequestConnector } from "./web-request";

const connectors: Record<string, ConnectorInstance> = {
  POSTGRES: new PostgresConnector(),
  MONGODB: new MongoDBConnector(),
  STRIPE: new StripeConnector(),
  EXTERNAL_MCP: new ExternalMcpConnector(),
  WEB_REQUEST: new WebRequestConnector(),
};

export function getConnector(type: string): ConnectorInstance {
  const connector = connectors[type];
  if (!connector) {
    throw new Error(`Unknown connector type: ${type}`);
  }
  return connector;
}

export function getConnectorTypes(): string[] {
  return Object.keys(connectors);
}
