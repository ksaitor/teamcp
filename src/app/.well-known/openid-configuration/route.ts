import { authServerMetadata } from "@/lib/oauth/metadata";
import { corsJson, corsPreflight } from "@/lib/oauth/cors";

// Some MCP clients probe the OpenID Connect discovery path; serve the same
// authorization-server metadata there.
export async function GET() {
  return corsJson(authServerMetadata());
}

export async function OPTIONS() {
  return corsPreflight();
}
