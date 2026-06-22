import { FiBarChart2 } from "react-icons/fi";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "google-analytics",
  type: "CUSTOM",
  label: "Google Analytics",
  description: "Query traffic and conversion data from GA4.",
  icon: FiBarChart2,
  available: false,
});
