import { SiMysql } from "react-icons/si";
import { defineConnector } from "@/lib/connectors-catalog/types";

export default defineConnector({
  slug: "mysql",
  type: "MYSQL",
  label: "MySQL",
  description: "Connect a MySQL database via connection string.",
  icon: SiMysql,
  available: true,
  credentialField: {
    label: "Connection string",
    inputType: "password",
    placeholder: "mysql://user:pass@host:3306/db",
  },
});
