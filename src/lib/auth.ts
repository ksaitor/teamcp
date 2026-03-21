import { auth } from "@/auth";
import { prisma } from "@/db";
import { AuthError } from "./errors";
import { generateSlug } from "./crypto";

interface SessionData {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: string;
}

export async function getSession(): Promise<SessionData | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = session.user as any;
  if (!user.activeOrgId || !user.activeMembershipId) return null;

  return {
    userId: user.id,
    organizationId: user.activeOrgId,
    membershipId: user.activeMembershipId,
    role: user.role,
  };
}

export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session) throw new AuthError("Not authenticated");
  return session;
}

export async function requireAdmin(): Promise<SessionData> {
  const session = await requireSession();
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    throw new AuthError("Admin access required");
  }
  return session;
}

export async function getSessionUser() {
  const session = await requireSession();
  const membership = await prisma.orgMembership.findUnique({
    where: { id: session.membershipId },
    include: {
      user: true,
      organization: true,
    },
  });
  if (!membership) throw new AuthError("Membership not found");
  return membership;
}

export async function signupWithOrg(data: {
  userId: string;
  orgName: string;
}) {
  const slug = generateSlug(data.orgName);

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    throw new Error("Organization name already taken");
  }

  const org = await prisma.organization.create({
    data: {
      name: data.orgName,
      slug,
      settings: { create: {} },
      memberships: {
        create: {
          userId: data.userId,
          role: "OWNER",
          status: "ACTIVE",
        },
      },
    },
    include: { memberships: true },
  });

  return { org, membership: org.memberships[0] };
}
