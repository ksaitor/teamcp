import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type TransportKind = "streamable-http" | "sse";

export interface ConnectOptions {
  serverUrl: string;
  /** Pin a transport (skips auto-detection). */
  transport?: TransportKind;
  /** OAuth provider for `authMode: "oauth"` connectors. */
  authProvider?: OAuthClientProvider;
  /** Static bearer token for `authMode: "token"` connectors. */
  token?: string;
  clientName?: string;
}

export interface ConnectedClient {
  client: Client;
  transportKind: TransportKind;
  close: () => Promise<void>;
}

function buildTransport(kind: TransportKind, opts: ConnectOptions): Transport {
  const url = new URL(opts.serverUrl);
  const requestInit = opts.token
    ? { headers: { Authorization: `Bearer ${opts.token}` } }
    : undefined;

  if (kind === "sse") {
    return new SSEClientTransport(url, {
      authProvider: opts.authProvider,
      requestInit,
    });
  }
  return new StreamableHTTPClientTransport(url, {
    authProvider: opts.authProvider,
    requestInit,
  });
}

/**
 * True when an error means "the server is reachable but requires authentication"
 * — either the SDK's UnauthorizedError, or a transport error carrying HTTP
 * 401/403 (which is what surfaces when no authProvider is supplied).
 */
export function isAuthError(err: unknown): boolean {
  if (err instanceof UnauthorizedError) return true;
  const code = (err as { code?: unknown })?.code;
  return code === 401 || code === 403;
}

async function tryConnect(
  kind: TransportKind,
  opts: ConnectOptions
): Promise<ConnectedClient> {
  const client = new Client({
    name: opts.clientName || "teamrouter",
    version: "1.0.0",
  });
  const transport = buildTransport(kind, opts);
  await client.connect(transport);
  return {
    client,
    transportKind: kind,
    close: () => client.close(),
  };
}

/**
 * Connect to an external MCP server. Tries Streamable HTTP first, falling back
 * to the deprecated SSE transport on connection/protocol errors (but NOT on
 * auth errors — those are rethrown so the caller can trigger the OAuth flow).
 * Pass `transport` to skip detection once the working transport is known.
 */
export async function connectMcp(opts: ConnectOptions): Promise<ConnectedClient> {
  if (opts.transport) {
    return tryConnect(opts.transport, opts);
  }

  try {
    return await tryConnect("streamable-http", opts);
  } catch (err) {
    // Auth errors mean the server IS reachable over Streamable HTTP — don't
    // fall back to SSE; rethrow so the caller can trigger authentication.
    if (isAuthError(err)) throw err;
    return tryConnect("sse", opts);
  }
}

export { UnauthorizedError };
