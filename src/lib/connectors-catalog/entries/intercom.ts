import { SiIntercom } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "intercom",
  type: "EXTERNAL_MCP",
  label: "Intercom",
  description:
    "Connect Intercom via its official hosted MCP server — conversations, contacts, tickets, and help center.",
  icon: SiIntercom,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.intercom.com/mcp",
    defaultName: "Intercom",
  },
});
