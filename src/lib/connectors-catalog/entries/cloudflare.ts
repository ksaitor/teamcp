import { SiCloudflare } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "cloudflare",
  type: "EXTERNAL_MCP",
  label: "Cloudflare",
  description:
    "Manage Cloudflare via its hosted MCP server — DNS, Workers, R2, Zero Trust, and 2,500+ API endpoints.",
  icon: SiCloudflare,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.cloudflare.com/mcp",
    defaultName: "Cloudflare",
  },
});
