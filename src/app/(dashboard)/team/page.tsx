import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getOrgUsage } from "@/lib/usage";
import { MembersTable, type MemberRow } from "./members-table";

export default async function MembersPage() {
  const session = await requireAdmin();

  const [memberships, usage] = await Promise.all([
    prisma.orgMembership.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true, image: true } },
        _count: { select: { connectorAccess: true, auditLogs: true } },
      },
    }),
    getOrgUsage(session.organizationId),
  ]);

  if (memberships.length === 0) {
    redirect("/team/new");
  }

  const members: MemberRow[] = memberships.map((m) => {
    const u = usage.get(m.id);
    return {
      id: m.id,
      role: m.role,
      status: m.status,
      suspendedAt: m.suspendedAt,
      jobTitle: m.jobTitle,
      user: m.user,
      connectorCount: m._count.connectorAccess,
      lastActiveAt: m.lastActiveAt,
      // This-month usage drives the list column; the member page shows both
      // windows. Plain numbers — safely under Number's integer range.
      monthCostCents: u?.thisMonth.costCents ?? 0,
      monthTokens: (u?.thisMonth.inputTokens ?? 0) + (u?.thisMonth.outputTokens ?? 0),
      monthUnpriced: u?.thisMonth.hasUnpriced ?? false,
    };
  });

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
