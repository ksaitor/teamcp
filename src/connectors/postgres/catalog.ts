import { FiDatabase } from "react-icons/fi";
import { defineConnector } from "@/lib/connectors-catalog/types";

export default defineConnector({
  slug: "postgres",
  type: "POSTGRES",
  label: "PostgreSQL",
  description: "Connect a PostgreSQL database via connection string.",
  icon: FiDatabase,
  available: true,
  credentialField: {
    label: "Connection string",
    inputType: "password",
    placeholder: "postgresql://user:pass@host:5432/db",
  },
});
