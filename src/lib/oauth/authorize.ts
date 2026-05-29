import { prisma } from "@/db";
import { parseAuthorizeParams, type AuthorizeParams } from "./params";

export type ValidationError =
  | { kind: "untrusted"; error: string } // can't safely redirect to client
  | { kind: "redirect"; error: string }; // safe to redirect to client

export interface ValidatedAuthorize {
  params: AuthorizeParams;
  clientName: string | null;
  orgName: string;
  membershipId: string;
}

// Validate /authorize params, the client + redirect_uri, the user's membership
// for the requested org. Returns either a fully validated request or an error
// classified by whether it's safe to redirect back to the client.
export async function validateAuthorize(
  sp: URLSearchParams,
  userId: string
): Promise<{ ok: true; data: ValidatedAuthorize } | { ok: false; err: ValidationError }> {
  const parsed = parseAuthorizeParams(sp);
  if (!parsed.ok) return { ok: false, err: { kind: "untrusted", error: parsed.error } };
  const params = parsed.params;

  const client = await prisma.oAuthClient.findUnique({
    where: { clientId: params.clientId },
  });
  if (!client) return { ok: false, err: { kind: "untrusted", error: "Unknown client" } };
  if (!client.redirectUris.includes(params.redirectUri))
    return { ok: false, err: { kind: "untrusted", error: "redirect_uri not registered" } };

  const membership = await prisma.orgMembership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      organization: { slug: params.slug },
    },
    include: { organization: { select: { name: true } } },
  });
  if (!membership)
    return {
      ok: false,
      err: {
        kind: "redirect",
        error: "You are not a member of this organization. Ask the owner to invite this email.",
      },
    };

  return {
    ok: true,
    data: {
      params,
      clientName: client.clientName,
      orgName: membership.organization.name,
      membershipId: membership.id,
    },
  };
}

export function buildRedirect(
  redirectUri: string,
  query: Record<string, string | null | undefined>
): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(query)) {
    if (v != null) url.searchParams.set(k, v);
  }
  return url.toString();
}
