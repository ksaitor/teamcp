import { SiStripe } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "stripe",
  type: "EXTERNAL_MCP",
  label: "Stripe",
  description:
    "Connect Stripe via its official hosted MCP server — payments, customers, subscriptions, invoices, and refunds.",
  icon: SiStripe,
  available: true,
  mcpPreset: {
    serverUrl: "https://mcp.stripe.com",
    defaultName: "Stripe",
  },
});
