import { SiVercel } from "react-icons/si";
import { defineConnector } from "@/lib/connectors-catalog/types";

export default defineConnector({
  slug: "vercel",
  type: "EXTERNAL_MCP",
  label: "Vercel",
  description:
    "Connect Vercel via its official hosted MCP server — projects, deployments, logs, and documentation.",
  icon: SiVercel,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.vercel.com",
    defaultName: "Vercel",
  },
});
