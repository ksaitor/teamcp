import { SiGithub } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "github",
  type: "EXTERNAL_MCP",
  label: "GitHub",
  description:
    "Connect GitHub via its official hosted MCP server — repositories, issues, pull requests, code, and Actions.",
  icon: SiGithub,
  available: true,
  mcpPreset: {
    serverUrl: "https://api.githubcopilot.com/mcp/",
    defaultName: "GitHub",
  },
});
