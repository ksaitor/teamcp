import { slugFromResource } from "./urls";

export interface AuthorizeParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | null;
  scope: string | null;
  resource: string;
  slug: string;
}

export type ParseResult =
  | { ok: true; params: AuthorizeParams }
  | { ok: false; error: string };

// Validate the /authorize query parameters per OAuth 2.1 + MCP Authorization
// spec. PKCE S256 and a valid resource (audience) are mandatory.
export function parseAuthorizeParams(sp: URLSearchParams): ParseResult {
  const responseType = sp.get("response_type") || "";
  const clientId = sp.get("client_id") || "";
  const redirectUri = sp.get("redirect_uri") || "";
  const codeChallenge = sp.get("code_challenge") || "";
  const codeChallengeMethod = sp.get("code_challenge_method") || "";
  const resource = sp.get("resource") || "";

  if (responseType !== "code") return { ok: false, error: "unsupported_response_type" };
  if (!clientId) return { ok: false, error: "client_id required" };
  if (!redirectUri) return { ok: false, error: "redirect_uri required" };
  if (!codeChallenge) return { ok: false, error: "code_challenge required (PKCE)" };
  if (codeChallengeMethod !== "S256")
    return { ok: false, error: "code_challenge_method must be S256" };
  if (!resource) return { ok: false, error: "resource required" };

  const slug = slugFromResource(resource);
  if (!slug) return { ok: false, error: "invalid resource" };

  return {
    ok: true,
    params: {
      responseType,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      state: sp.get("state"),
      scope: sp.get("scope"),
      resource,
      slug,
    },
  };
}
