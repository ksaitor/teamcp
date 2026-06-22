/**
 * Runtime helpers for the Xero connector: parse the stored app credentials,
 * keep a valid access token (refreshing + persisting the rotated refresh token),
 * and make authenticated Xero API calls.
 */

import { prisma } from "@/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { refreshTokens, type XeroTokens } from "./oauth";

const API_BASE = "https://api.xero.com/api.xro/2.0";
/** Refresh when the access token is within this window of expiring. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** The client's own Xero app credentials, stored in credentialsEncrypted. */
export interface XeroAppCredentials {
  clientId: string;
  clientSecret: string;
}

export function parseAppCredentials(raw: string): XeroAppCredentials {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Xero connector credentials are malformed");
  }
  if (!parsed?.clientId || !parsed?.clientSecret) {
    throw new Error("Xero connector is missing Client ID or Client Secret");
  }
  return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
}

async function loadTokens(connectorId: string): Promise<XeroTokens> {
  const row = await prisma.connectorOAuth.findUnique({ where: { connectorId } });
  if (!row?.tokensEnc) {
    throw new Error("Xero connector is not authenticated");
  }
  return JSON.parse(decrypt(row.tokensEnc)) as XeroTokens;
}

export async function saveTokens(
  connectorId: string,
  tokens: XeroTokens
): Promise<void> {
  await prisma.connectorOAuth.update({
    where: { connectorId },
    data: { tokensEnc: encrypt(JSON.stringify(tokens)), scope: tokens.scope ?? null },
  });
}

/**
 * Return a currently-valid access token, refreshing first if it is at or near
 * expiry. The refresh token rotates on every refresh, so the new pair is
 * persisted immediately. On refresh failure the connector is flagged ERROR so
 * the reauth banner surfaces, and the error is rethrown.
 */
export async function getValidAccessToken(
  connectorId: string,
  creds: XeroAppCredentials
): Promise<string> {
  const tokens = await loadTokens(connectorId);
  if (Date.now() < tokens.expires_at - REFRESH_SKEW_MS) {
    return tokens.access_token;
  }
  try {
    const refreshed = await refreshTokens({
      refreshToken: tokens.refresh_token,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
    });
    await saveTokens(connectorId, refreshed);
    return refreshed.access_token;
  } catch (err) {
    await prisma.connector
      .update({ where: { id: connectorId }, data: { status: "ERROR" } })
      .catch(() => {});
    throw err;
  }
}

/**
 * Make an authenticated Xero API request scoped to one organisation (tenant).
 * Returns parsed JSON; throws with the response body on non-2xx.
 */
export async function xeroRequest(opts: {
  accessToken: string;
  tenantId: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}): Promise<any> {
  const url = new URL(`${API_BASE}/${opts.path.replace(/^\//, "")}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const resp = await fetch(url, {
    method: opts.method,
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Xero-tenant-id": opts.tenantId,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Xero API ${resp.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}
