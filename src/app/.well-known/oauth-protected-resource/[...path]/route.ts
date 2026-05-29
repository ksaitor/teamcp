import { issuer } from "@/lib/oauth/urls";
import { corsJson, corsPreflight } from "@/lib/oauth/cors";

// RFC 9728 Protected Resource Metadata. The path mirrors the MCP resource, e.g.
// /.well-known/oauth-protected-resource/mcp/<slug> describes the resource
// <APP_URL>/mcp/<slug> and points clients at this app as its auth server.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const resource = `${issuer()}/${path.join("/")}`;

  return corsJson({
    resource,
    authorization_servers: [issuer()],
    bearer_methods_supported: ["header"],
  });
}

export async function OPTIONS() {
  return corsPreflight();
}
