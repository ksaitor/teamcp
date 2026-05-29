import { NextResponse } from "next/server";

// OAuth discovery/registration/token endpoints are fetched cross-origin by
// browser-based MCP clients (e.g. MCP Inspector), so they need permissive CORS.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Protocol-Version",
};

export function corsJson(data: unknown, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(data as never, init);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
