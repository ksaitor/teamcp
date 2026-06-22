import { SiSnowflake } from "react-icons/si";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "snowflake",
  type: "CUSTOM",
  label: "Snowflake",
  description: "Run queries against your Snowflake warehouse.",
  icon: SiSnowflake,
  available: false,
});
