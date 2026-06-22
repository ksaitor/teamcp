import { FiGlobe } from "react-icons/fi";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "web-request",
  type: "WEB_REQUEST",
  label: "Web Request",
  description:
    "Call any HTTP endpoint — REST APIs, internal services, lookups.",
  icon: FiGlobe,
  available: true,
  order: 1,
});
