import { SiZapier } from "react-icons/si";
import { defineConnector } from "@/lib/connectors-catalog/types";

export default defineConnector({
  slug: "zapier",
  type: "EXTERNAL_MCP",
  label: "Zapier",
  description:
    "Connect Zapier via its official hosted MCP server — trigger Zaps and reach thousands of connected apps.",
  icon: SiZapier,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.zapier.com/api/mcp/mcp",
    defaultName: "Zapier",
  },
});
