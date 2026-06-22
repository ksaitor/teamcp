import { SiSupabase } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "supabase",
  type: "EXTERNAL_MCP",
  label: "Supabase",
  description:
    "Connect Supabase via its official hosted MCP server — projects, database, edge functions, and logs.",
  icon: SiSupabase,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.supabase.com/mcp",
    defaultName: "Supabase",
  },
});
