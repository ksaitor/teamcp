import { SiAtlassian } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "atlassian",
  type: "EXTERNAL_MCP",
  label: "Atlassian",
  description:
    "Connect Jira and Confluence via Atlassian's official hosted MCP server — issues, projects, pages, and search.",
  icon: SiAtlassian,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.atlassian.com/v1/mcp",
    defaultName: "Atlassian",
  },
});
