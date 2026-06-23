import { FiTarget } from "react-icons/fi";
import { defineConnector } from "@/lib/connectors-catalog/types";

export default defineConnector({
  slug: "close",
  type: "EXTERNAL_MCP",
  label: "Close CRM",
  description:
    "Connect Close via its official hosted MCP server — leads, contacts, opportunities, tasks, and activity search.",
  icon: FiTarget,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.close.com/mcp",
    defaultName: "Close CRM",
  },
});
