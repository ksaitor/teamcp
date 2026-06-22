import { SiMongodb } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "mongodb",
  type: "MONGODB",
  label: "MongoDB",
  description: "Connect a MongoDB database via connection string.",
  icon: SiMongodb,
  available: true,
  credentialField: {
    label: "Connection string",
    inputType: "password",
    placeholder: "mongodb://user:pass@host:27017/db",
  },
});
