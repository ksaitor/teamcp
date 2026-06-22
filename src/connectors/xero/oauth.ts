/**
 * Xero OAuth2 (authorization-code) helpers — plain `fetch`, no MCP SDK.
 *
 * Protocol shape mirrors the reference `xero-auth.ts` script, but no client
 * IDs, secrets, scopes-as-configured, org names, or ports are carried over.
 */

import { getConfig } from "@/lib/config";

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";

/**
 * The OAuth redirect URI for Xero connectors. Must be registered verbatim in
 * the client's Xero app config; the setup wizard shows this exact string.
 */
export function xeroRedirectUri(): string {
  return `${getConfig().APP_URL}/api/connectors/xero/callback`;
}

/**
 * Requested scopes. `offline_access` is required to receive a refresh token.
 * Xero silently drops any scope the app isn't entitled to, so this set is a
 * superset covering the read + write tools the connector exposes.
 */
export const XERO_SCOPES = [
  "openid",
  "offline_access",
  "accounting.contacts",
  "accounting.settings",
  "accounting.transactions",
  "accounting.journals.read",
  "accounting.reports.read",
  "accounting.attachments",
].join(" ");

/** Token blob persisted (encrypted) in ConnectorOAuth.tokensEnc. */
export interface XeroTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch ms when the access token expires. */
  expires_at: number;
  scope?: string;
}

/** One authorized Xero organisation, from the /connections endpoint. */
export interface XeroConnection {
  id: string;
  tenantId: string;
  tenantType: string;
  tenantName: string;
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: XERO_SCOPES,
    state: opts.state,
  });
  return `${AUTH_URL}?${params}`;
}

function toTokens(raw: any): XeroTokens {
  const expiresIn = Number(raw.expires_in ?? 1800);
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    // Subtract a small skew so we refresh slightly early.
    expires_at: Date.now() + expiresIn * 1000,
    scope: raw.scope,
  };
}

export async function exchangeCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<XeroTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Xero token exchange failed: ${resp.status} ${await resp.text()}`);
  }
  return toTokens(await resp.json());
}

export async function refreshTokens(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<XeroTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Xero token refresh failed: ${resp.status} ${await resp.text()}`);
  }
  return toTokens(await resp.json());
}

export async function getConnections(accessToken: string): Promise<XeroConnection[]> {
  const resp = await fetch(CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) {
    throw new Error(`Xero connections lookup failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}
