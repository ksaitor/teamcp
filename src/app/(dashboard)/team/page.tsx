import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { MembersTable, type MemberRow } from "./members-table";

export default async function MembersPage() {
  const session = await requireAdmin();

  const memberships = await prisma.orgMembership.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true, image: true } },
      _count: { select: { connectorAccess: true, auditLogs: true } },
      connectorAccess: { select: { connectorId: true } },
    },
  });

  if (memberships.length === 0) {
    redirect("/team/new");
  }

  // Tool access is "allowed by default, deny specific tools", so a member's
  // accessible tool count per connector is its enabled tools minus their
  // explicit denials. Total = sum over the connectors they can access.
  const enabledTools = await prisma.connectorTool.groupBy({
    by: ["connectorId"],
    where: {
      enabled: true,
      connector: { organizationId: session.organizationId },
    },
    _count: { _all: true },
  });
  const enabledByConnector = new Map(
    enabledTools.map((t) => [t.connectorId, t._count._all])
  );

  const denials = await prisma.memberToolAccess.findMany({
    where: {
      allowed: false,
      connectorTool: {
        enabled: true,
        connector: { organizationId: session.organizationId },
      },
    },
    select: {
      membershipId: true,
      connectorTool: { select: { connectorId: true } },
    },
  });
  const deniedByMemberConnector = new Map<string, number>();
  for (const d of denials) {
    const key = `${d.membershipId}:${d.connectorTool.connectorId}`;
    deniedByMemberConnector.set(key, (deniedByMemberConnector.get(key) ?? 0) + 1);
  }

  const members: MemberRow[] = memberships.map((m) => ({
    id: m.id,
    role: m.role,
    status: m.status,
    suspendedAt: m.suspendedAt,
    jobTitle: m.jobTitle,
    user: m.user,
    connectorCount: m._count.connectorAccess,
    toolCount: m.connectorAccess.reduce((sum, ca) => {
      const enabled = enabledByConnector.get(ca.connectorId) ?? 0;
      const denied = deniedByMemberConnector.get(`${m.id}:${ca.connectorId}`) ?? 0;
      return sum + Math.max(0, enabled - denied);
    }, 0),
    lastActiveAt: m.lastActiveAt,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Team</h1>
        <Link
          href="/team/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add team member
        </Link>
      </div>

      <MembersTable members={members} />
    </div>
  );
}
