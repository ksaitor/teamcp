import { SiStripe } from "react-icons/si";
import { defineConnector } from "@/lib/connectors-catalog/types";

/**
 * Legacy direct-API Stripe connector, kept as a fallback for setups that can't
 * use the official hosted MCP (see
 * `src/lib/connectors-catalog/entries/stripe.ts`). Backed by this `STRIPE`
 * connector, which calls the Stripe SDK with a (preferably restricted) API key.
 * Sorted after the MCP entry so the hosted MCP stays the default.
 */
export default defineConnector({
  slug: "stripe-api-key",
  type: "STRIPE",
  label: "Stripe (API key)",
  description:
    "Connect Stripe directly with an API key instead of the hosted MCP — read payments, customers, and subscriptions.",
  icon: SiStripe,
  available: true,
  order: 110,
  credentialField: {
    label: "API key",
    inputType: "password",
    placeholder: "rk_live_… (restricted key recommended)",
  },
});
