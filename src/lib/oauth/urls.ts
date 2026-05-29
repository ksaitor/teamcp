import { getConfig } from "@/lib/config";

// The unified server serves the admin UI, OAuth endpoints, and the MCP gateway
// from a single origin. APP_URL is that canonical origin — issuer + resource
// audience all derive from it.
export function issuer(): string {
  return getConfig().APP_URL.replace(/\/$/, "");
}

// The OAuth "resource" (audience) for an org's MCP endpoint.
export function resourceForSlug(slug: string): string {
  return `${issuer()}/mcp/${slug}`;
}

// Extract the org slug from a resource URL, or null if it isn't a valid
// MCP resource on this issuer.
export function slugFromResource(resource: string): string | null {
  const prefix = `${issuer()}/mcp/`;
  if (!resource.startsWith(prefix)) return null;
  const slug = resource.slice(prefix.length).split("/")[0];
  return slug || null;
}
