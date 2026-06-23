import { SiLinear } from "react-icons/si";
import { defineConnector } from "@/lib/connectors-catalog/types";

export default defineConnector({
  slug: "linear",
  type: "EXTERNAL_MCP",
  label: "Linear",
  description:
    "Connect Linear via its official hosted MCP server — search, create, and update issues, projects, and comments.",
  icon: SiLinear,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.linear.app/mcp",
    defaultName: "Linear",
  },
});
