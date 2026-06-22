import { SiAirtable } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "airtable",
  type: "EXTERNAL_MCP",
  label: "Airtable",
  description:
    "Connect Airtable via its official hosted MCP server — bases, tables, records, and search.",
  icon: SiAirtable,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.airtable.com/mcp",
    defaultName: "Airtable",
  },
});
