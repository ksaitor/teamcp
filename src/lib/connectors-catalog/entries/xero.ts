import { SiXero } from "react-icons/si";
import { defineConnector } from "../types";

/**
 * Native Xero connector. Uses a dedicated OAuth wizard (not `credentialField`),
 * so the client registers their own Xero app and enters Client ID + Secret —
 * see `connectors/new/[type]/xero-wizard.tsx`.
 */
export default defineConnector({
  slug: "xero",
  type: "XERO",
  label: "Xero",
  description:
    "Connect a Xero accounting organisation — contacts, invoices, bank transactions, accounts, payments, and manual journals.",
  icon: SiXero,
  available: true,
});
