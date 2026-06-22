import { SiStripe } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "stripe",
  type: "STRIPE",
  label: "Stripe",
  description: "Read payments, customers, and subscriptions from Stripe.",
  icon: SiStripe,
  available: true,
  credentialField: {
    label: "API key",
    inputType: "password",
    placeholder: "sk_live_...",
  },
});
