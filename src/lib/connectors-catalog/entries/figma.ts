import { SiFigma } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "figma",
  type: "EXTERNAL_MCP",
  label: "Figma",
  description:
    "Connect Figma via its official hosted MCP server — files, frames, components, and design context.",
  icon: SiFigma,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.figma.com/mcp",
    defaultName: "Figma",
  },
});
