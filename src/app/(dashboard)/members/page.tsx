import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { AddMemberForm } from "./add-member-form";
import { MembersTable, type MemberRow } from "./members-table";

export default async function MembersPage() {
  const session = await requireAdmin();

  const memberships = await prisma.orgMembership.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true, image: true } },
      _count: { select: { connectorAccess: true, auditLogs: true } },
    },
  });

  const members: MemberRow[] = memberships.map((m) => ({
    id: m.id,
    role: m.role,
    status: m.status,
    suspendedAt: m.suspendedAt,
    jobTitle: m.jobTitle,
    user: m.user,
    connectorCount: m._count.connectorAccess,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Members</h1>
        <AddMemberForm />
      </div>

      <MembersTable members={members} />
    </div>
  );
}
