import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { AddMemberForm } from "./add-member-form";

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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Members</h1>
        <AddMemberForm />
      </div>

      <div className="mt-6">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Title</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Connectors</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {memberships.map((m) => (
              <tr key={m.id}>
                <td className="py-3">
                  <Link
                    href={`/members/${m.id}`}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    <Avatar name={m.user.name} email={m.user.email} image={m.user.image} />
                    {m.user.name || "—"}
                  </Link>
                </td>
                <td className="py-3 text-muted-foreground">{m.user.email}</td>
                <td className="py-3 text-muted-foreground" title={m.jobTitle || undefined}>
                  {m.jobTitle
                    ? m.jobTitle.length > 120
                      ? `${m.jobTitle.slice(0, 120)}…`
                      : m.jobTitle
                    : "—"}
                </td>
                <td className="py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {m.role}
                  </span>
                </td>
                <td className="py-3">
                  <StatusBadge status={m.status} suspendedAt={m.suspendedAt} />
                </td>
                <td className="py-3 text-muted-foreground">
                  {m._count.connectorAccess}
                </td>
                <td className="py-3">
                  <Link
                    href={`/members/${m.id}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Configure
                  </Link>
                </td>
              </tr>
            ))}
            {memberships.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No members yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Avatar({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string;
  image: string | null;
}) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={image}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initial = (name || email).charAt(0).toUpperCase();
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {initial}
    </span>
  );
}

function StatusBadge({ status, suspendedAt }: { status: string; suspendedAt: Date | null }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-success/10 text-success",
    INVITED: "bg-info/10 text-info",
    SUSPENDED: "bg-destructive/10 text-destructive",
    REVOKED: "bg-muted text-muted-foreground",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || ""}`}>
      {status}
      {suspendedAt && (
        <span className="ml-1 text-[10px] opacity-70">
          since {suspendedAt.toLocaleDateString()}
        </span>
      )}
    </span>
  );
}
