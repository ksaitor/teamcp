// Recognized OAuth clients get their real brand mark on the consent screen
// instead of a generic placeholder. Matched by the host of the registered
// redirect_uri, so we don't trust a self-reported client_name for branding.
//
// Logos live under /public/client-logos as full-color SVGs (NOT currentColor
// masks) so well-known marks render in their own brand colors.

export interface ClientBrand {
  /** Preferred display name (overrides the self-reported client_name). */
  name: string;
  /** Path under /public to a full-color logo. */
  logo: string;
}

// Keyed by redirect_uri host suffix. A request matches when its redirect_uri
// host equals the key or ends with "." + key (covers subdomains).
const BRANDS_BY_HOST: Record<string, ClientBrand> = {
  "claude.ai": { name: "Claude", logo: "/client-logos/claude.svg" },
  "claude.com": { name: "Claude", logo: "/client-logos/claude.svg" },
};

function hostMatches(host: string, key: string): boolean {
  return host === key || host.endsWith(`.${key}`);
}

// Resolve a known brand from a redirect_uri. Returns null for unknown clients.
export function resolveClientBrand(redirectUri: string | undefined): ClientBrand | null {
  if (!redirectUri) return null;
  let host: string;
  try {
    host = new URL(redirectUri).host.toLowerCase();
  } catch {
    return null;
  }
  for (const [key, brand] of Object.entries(BRANDS_BY_HOST)) {
    if (hostMatches(host, key)) return brand;
  }
  return null;
}
