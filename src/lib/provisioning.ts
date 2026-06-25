import { prisma } from "@/db";
import { extensions } from "@/extensions";
import { OrgCreationLockedError, ProvisioningLockedError } from "./errors";

/**
 * Tenancy gates — single-org by default.
 *
 * The OSS build is meant to be self-hosted by one organization: exactly one org,
 * and only people that org's admin has invited may sign in. These two helpers are
 * the single chokepoints that enforce that. Both defer to an extension hook when
 * the proprietary build registers one (restoring multi-tenancy); with nothing
 * registered, the hardcoded single-tenant rules below apply.
 */

/**
 * Throws OrgCreationLockedError unless a new organization may be created.
 * OSS default: only the very first organization may ever be created.
 */
export async function assertOrgMayBeCreated(userId: string): Promise<void> {
  if (extensions.canCreateOrganization) {
    const decision = await extensions.canCreateOrganization(userId);
    if (!decision.allowed) throw new OrgCreationLockedError(decision.reason);
    return;
  }

  const orgCount = await prisma.organization.count();
  if (orgCount > 0) {
    throw new OrgCreationLockedError();
  }
}

/**
 * Throws ProvisioningLockedError unless this email may obtain an account.
 *
 * Safe to call from any auth path: it allows users that already exist (returning
 * or pre-invited sign-ins) and only gates the creation of brand-new accounts.
 *
 * OSS default, for an email with no existing user:
 *   - allow if no organization exists yet (the bootstrap admin signing up), or
 *   - allow if an INVITED membership exists for this email (a pre-invited teammate),
 *   - otherwise reject (a stranger — no self-service sign-up).
 */
export async function assertUserMayBeProvisioned(email: string): Promise<void> {
  if (extensions.canProvisionUser) {
    const decision = await extensions.canProvisionUser(email);
    if (!decision.allowed) throw new ProvisioningLockedError(decision.reason);
    return;
  }

  // Returning/known user — this is not new provisioning, so let them authenticate.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return;

  // Bootstrap: the first admin signs up before any org exists.
  const orgCount = await prisma.organization.count();
  if (orgCount === 0) return;

  // Pre-invited teammate (belt-and-suspenders: invites normally create the user
  // row above, but match by email here too in case one exists without a user).
  const invite = await prisma.orgMembership.findFirst({
    where: { status: "INVITED", user: { email } },
  });
  if (invite) return;

  throw new ProvisioningLockedError();
}
