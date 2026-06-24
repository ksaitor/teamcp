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
    },
  });

  if (memberships.length === 0) {
    redirect("/team/new");
  }

  const members: MemberRow[] = memberships.map((m) => ({
    id: m.id,
    role: m.role,
    status: m.status,
    suspendedAt: m.suspendedAt,
    jobTitle: m.jobTitle,
    user: m.user,
    connectorCount: m._count.connectorAccess,
    lastActiveAt: m.lastActiveAt,
    // BigInt isn't serializable across the RSC boundary; token counts stay well
    // within Number's safe integer range, so coerce for the client table.
    llmTokens: Number(m.llmInputTokens) + Number(m.llmOutputTokens),
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
