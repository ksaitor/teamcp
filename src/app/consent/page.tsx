import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FiArrowRight } from "react-icons/fi";
import { validateAuthorize } from "@/lib/oauth/authorize";

// A square logo badge: shows the brand/team logo when available, otherwise a
// placeholder with the entity's initials. `contain` keeps full-bleed brand
// marks (e.g. Claude) intact rather than cover-cropping them.
function LogoBadge({ label, logo }: { label: string; logo: string | null }) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={`${label} logo`} className="h-full w-full object-contain p-2" />
      ) : (
        <span className="text-lg font-semibold text-muted-foreground" aria-label={label}>
          {initials || "?"}
        </span>
      )}
    </div>
  );
}

const PASS_THROUGH = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const spObj = await searchParams;

  const errorParam =
    typeof spObj.error === "string" ? spObj.error : undefined;

  if (errorParam) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Authorization error</h1>
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorParam}
          </div>
        </div>
      </div>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    const sp = new URLSearchParams();
    for (const key of PASS_THROUGH) {
      const v = spObj[key];
      if (typeof v === "string") sp.set(key, v);
    }
    redirect(`/login?callbackUrl=${encodeURIComponent(`/authorize?${sp.toString()}`)}`);
  }

  const sp = new URLSearchParams();
  for (const key of PASS_THROUGH) {
    const v = spObj[key];
    if (typeof v === "string") sp.set(key, v);
  }

  const result = await validateAuthorize(sp, session.user.id);
  if (!result.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Authorization error</h1>
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {result.err.error}
          </div>
        </div>
      </div>
    );
  }

  const { params, clientName, clientLogo, orgName, orgLogo } = result.data;
  const clientLabel = clientName || "An MCP client";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mb-5 flex items-center justify-center gap-3">
            <LogoBadge label={clientLabel} logo={clientLogo} />
            <FiArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <LogoBadge label={orgName} logo={orgLogo} />
          </div>
          <h1 className="text-2xl font-bold">Authorize access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <strong className="text-foreground">{clientLabel}</strong>{" "}
            wants to connect to{" "}
            <strong className="text-foreground">{orgName}</strong> on your behalf
            as <strong className="text-foreground">{session.user.email}</strong>.
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          It will be able to use the tools your organization has granted you.
        </div>

        <form method="post" action="/authorize" className="space-y-3">
          {PASS_THROUGH.map((key) =>
            params[paramKey(key)] != null ? (
              <input
                key={key}
                type="hidden"
                name={key}
                value={String(params[paramKey(key)])}
              />
            ) : null
          )}
          <button
            type="submit"
            name="decision"
            value="allow"
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Allow
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            className="w-full rounded-md border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Deny
          </button>
        </form>
      </div>
    </div>
  );
}

// Map the query param name to its AuthorizeParams field.
function paramKey(
  key: (typeof PASS_THROUGH)[number]
):
  | "responseType"
  | "clientId"
  | "redirectUri"
  | "codeChallenge"
  | "codeChallengeMethod"
  | "state"
  | "scope"
  | "resource" {
  switch (key) {
    case "response_type":
      return "responseType";
    case "client_id":
      return "clientId";
    case "redirect_uri":
      return "redirectUri";
    case "code_challenge":
      return "codeChallenge";
    case "code_challenge_method":
      return "codeChallengeMethod";
    default:
      return key;
  }
}
