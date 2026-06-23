import { FiHardDrive } from "react-icons/fi";
import { defineConnector } from "../types";

export default defineConnector({
  slug: "s3",
  type: "S3",
  label: "S3 Storage",
  description:
    "Connect any S3-compatible object storage — AWS S3, Hetzner, MinIO, Cloudflare R2, Backblaze — via endpoint and access keys.",
  icon: FiHardDrive,
  available: true,
});
