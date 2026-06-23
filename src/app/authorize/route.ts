import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/db";
import { generateToken, sha256 } from "@/lib/crypto";
import { validateAuthorize, buildRedirect } from "@/lib/oauth/authorize";
import { issuer } from "@/lib/oauth/urls";

const AUTH_CODE_TTL_MS = 60_000;

// Status defaults to 307, but redirects that follow a POST (the consent form
// submission) must use 303 so the browser switches to GET when following them.
// Claude's redirect_uri (and our /consent page) only accept GET; a 307 would
// re-issue the request as a POST and the target replies 405 Method Not Allowed.
function consentError(message: string, status = 307) {
  const url = new URL("/consent", issuer());
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, status);
}

// GET /authorize — the OAuth 2.1 authorization endpoint. Validates the request,
// requires a logged-in Teamcp session (bouncing through /login if needed),
// then shows the consent screen.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = `/authorize?${sp.toString()}`;
    const loginUrl = new URL("/login", issuer());
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  const result = await validateAuthorize(sp, session.user.id);
  if (!result.ok) {
    // For both untrusted and membership errors we show our own page (clearer
    // for the user than bouncing an error back to the client).
    return consentError(result.err.error);
  }

  // Hand off to the consent screen, preserving the validated params.
  const consentUrl = new URL("/consent", issuer());
  sp.forEach((v, k) => consentUrl.searchParams.set(k, v));
  return NextResponse.redirect(consentUrl);
}

// POST /authorize — consent form submission. Re-validates everything, then
// either denies (redirect back with error) or mints a single-use auth code.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const form = await req.formData();
  const sp = new URLSearchParams();
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") sp.set(k, v);
  }
  const decision = sp.get("decision");

  const result = await validateAuthorize(sp, session.user.id);
  if (!result.ok) {
    return consentError(result.err.error, 303);
  }
  const { params, membershipId } = result.data;

  if (decision !== "allow") {
    return NextResponse.redirect(
      buildRedirect(params.redirectUri, {
        error: "access_denied",
        state: params.state,
      }),
      303
    );
  }

  const code = generateToken();
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: sha256(code),
      clientId: params.clientId,
      membershipId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      scope: params.scope,
      resource: params.resource,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });

  return NextResponse.redirect(
    buildRedirect(params.redirectUri, { code, state: params.state }),
    303
  );
}
