import { FiSearch } from "react-icons/fi";
import { defineConnector } from "@/lib/connectors-catalog/types";

export default defineConnector({
  slug: "seoptimer",
  type: "EXTERNAL_MCP",
  label: "SEOptimer",
  description:
    "Run on-demand SEO audits and reports through SEOptimer's hosted MCP server — site audits, scores, and improvement recommendations for any domain.",
  icon: FiSearch,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.seoptimer.com/v1/mcp",
    defaultName: "SEOptimer",
  },
});
