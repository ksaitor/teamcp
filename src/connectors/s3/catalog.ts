import dynamic from "next/dynamic";
import { FiHardDrive } from "react-icons/fi";
import { defineConnector } from "@/lib/connectors-catalog/types";

// Co-located gallery entry for the S3 connector. Kept client-safe: it imports
// only the icon, the catalog types, and a lazily-loaded form — never the
// server-only `./index.ts`. `next/dynamic` keeps the form out of the gallery
// bundle and lets the (server) add-connector page render it.
const S3Form = dynamic(() => import("./form").then((m) => m.S3Form));

export default defineConnector({
  slug: "s3",
  type: "S3",
  label: "S3 Storage",
  description:
    "Connect any S3-compatible object storage — AWS S3, Hetzner, MinIO, Cloudflare R2, Backblaze — via endpoint and access keys.",
  icon: FiHardDrive,
  available: true,
  form: S3Form,
});
