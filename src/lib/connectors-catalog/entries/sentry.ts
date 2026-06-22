import { SiSentry } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "sentry",
  type: "EXTERNAL_MCP",
  label: "Sentry",
  description:
    "Connect Sentry via its official hosted MCP server — issues, errors, releases, and project monitoring.",
  icon: SiSentry,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.sentry.dev/mcp",
    defaultName: "Sentry",
  },
});
