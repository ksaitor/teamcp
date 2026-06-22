import { FiServer } from "react-icons/fi";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "custom-mcp",
  type: "EXTERNAL_MCP",
  label: "Custom MCP Server",
  description: "Connect any external MCP server by URL.",
  icon: FiServer,
  available: true,
  order: 0,
  credentialField: {
    label: "Server URL",
    inputType: "url",
    placeholder: "https://mcp-server.example.com",
    configKey: "serverUrl",
  },
});
