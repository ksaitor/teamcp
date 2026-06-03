import { extensions } from "@/extensions";

/**
 * Returns true if the user is a platform-level super admin.
 *
 * By default no user is a super admin. Operators may register an
 * `isSuperAdmin` extension to provide an implementation (e.g. an allowlist of
 * email addresses, a role flag, an external IdP lookup).
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  if (extensions.isSuperAdmin) return extensions.isSuperAdmin(userId);
  return false;
}
