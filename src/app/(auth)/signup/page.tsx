import { getConfig } from "@/lib/config";
import { prisma } from "@/db";
import { extensions } from "@/extensions";
import SignupForm from "./signup-form";

// Org-existence is read per request (it changes once the first org is created),
// so this page must not be statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const config = getConfig();
  const providers = {
    google: !!config.GOOGLE_CLIENT_ID && !!config.GOOGLE_CLIENT_SECRET,
    github: !!config.GITHUB_CLIENT_ID && !!config.GITHUB_CLIENT_SECRET,
  };
  // Single-org tenancy (OSS default): once the deployment's org exists, the
  // org-creation step is gone — new sign-ins are invite-only. The proprietary
  // build registers canCreateOrganization, which keeps signup open.
  const orgCreationOpen =
    !!extensions.canCreateOrganization || (await prisma.organization.count()) === 0;
  return <SignupForm providers={providers} orgCreationOpen={orgCreationOpen} />;
}
