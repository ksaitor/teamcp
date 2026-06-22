import { SiCanva } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "canva",
  type: "EXTERNAL_MCP",
  label: "Canva",
  description:
    "Connect Canva via its official hosted MCP server — create and edit designs, browse assets, and export.",
  icon: SiCanva,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.canva.com/mcp",
    defaultName: "Canva",
  },
});
