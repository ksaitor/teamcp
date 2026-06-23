import { FiTrendingUp } from "react-icons/fi";
import { defineConnector } from "@/lib/connectors-catalog/types";

export default defineConnector({
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
});
