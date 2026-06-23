import { SiNotion } from "react-icons/si";
import { defineConnector } from "@/lib/connectors-catalog/types";

export default defineConnector({
  slug: "notion",
  type: "EXTERNAL_MCP",
  label: "Notion",
  description:
    "Connect Notion via its hosted MCP server — search, read, and update pages, databases, and comments.",
  icon: SiNotion,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.notion.com/mcp",
    defaultName: "Notion",
  },
});
