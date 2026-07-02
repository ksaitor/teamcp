import Link from "next/link";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { extensions } from "@/extensions";
import { appVersionLabel, appCommitUrl } from "@/lib/version";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsForm } from "./settings-form";
import { OrgLogoForm } from "./org-logo-form";
import { DangerZone } from "./danger-zone";
import { LogoutLink } from "./logout-link";
import { Appearance } from "./appearance";

export default async function SettingsPage() {
  const session = await requireAdmin();

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    include: { settings: true },
  });

  if (!org) return null;

  return (
    <>
      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">Organization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <strong>{org.name}</strong> ({org.slug})
        </p>
        {org.suspendedAt && (
          <p className="mt-2 inline-block rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            Suspended
          </p>
        )}
      </div>

      <OrgLogoForm name={org.name} logoUrl={org.logoUrl} />

      <Appearance />

      {org.settings && <SettingsForm settings={org.settings} />}

      {extensions.renderSettingsExtras &&
        (await extensions.renderSettingsExtras(session.organizationId))}

      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">Feedback</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Missing a feature or have an idea? Let us know.
        </p>
        <a
          href="https://github.com/ksaitor/teamcp/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline" }), "mt-3")}
        >
          Feature request
        </a>
      </div>

      <DangerZone
        orgName={org.name}
        suspended={Boolean(org.suspendedAt)}
        isOwner={session.role === "OWNER"}
      />

      <div className="flex items-center justify-between border-t border-border pt-4">
        {appVersionLabel ? (
          <p className="text-xs text-muted-foreground">
            Teamcp version{" "}
            {appCommitUrl ? (
              <Link
                href={appCommitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-foreground hover:underline"
              >
                {appVersionLabel}
              </Link>
            ) : (
              <span className="font-mono text-foreground">
                {appVersionLabel}
              </span>
            )}
          </p>
        ) : (
          <span />
        )}
        <LogoutLink />
      </div>
    </>
  );
}
