import dynamic from "next/dynamic";
import { FiGlobe } from "react-icons/fi";
import { defineConnector } from "@/lib/connectors-catalog/types";

// Co-located gallery entry for the Web Request connector. The multi-step form is
// lazily loaded so it stays out of the gallery bundle and the (server)
// add-connector page can render it generically.
const WebRequestForm = dynamic(() =>
  import("./form").then((m) => m.WebRequestForm)
);

export default defineConnector({
  slug: "web-request",
  type: "WEB_REQUEST",
  label: "Web Request",
  description:
    "Call any HTTP endpoint — REST APIs, internal services, lookups.",
  icon: FiGlobe,
  available: true,
  order: 1,
  form: WebRequestForm,
  wide: true,
});
