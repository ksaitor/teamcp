import { authServerMetadata } from "@/lib/oauth/metadata";
import { corsJson, corsPreflight } from "@/lib/oauth/cors";

export async function GET() {
  return corsJson(authServerMetadata());
}

export async function OPTIONS() {
  return corsPreflight();
}
