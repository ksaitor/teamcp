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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
      </div>

      <AddMemberForm />

      <div className="mt-6">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
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
          <tbody className="divide-y divide-gray-100">
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
                <td className="py-3 text-gray-600">{m.user.email}</td>
                <td className="py-3 text-gray-600" title={m.jobTitle || undefined}>
                  {m.jobTitle
                    ? m.jobTitle.length > 120
                      ? `${m.jobTitle.slice(0, 120)}…`
                      : m.jobTitle
                    : "—"}
                </td>
                <td className="py-3">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {m.role}
                  </span>
                </td>
                <td className="py-3">
                  <StatusBadge status={m.status} suspendedAt={m.suspendedAt} />
                </td>
                <td className="py-3 text-gray-600">
                  {m._count.connectorAccess}
                </td>
                <td className="py-3">
                  <Link
                    href={`/members/${m.id}`}
                    className="text-gray-500 hover:text-gray-900"
                  >
                    Configure
                  </Link>
                </td>
              </tr>
            ))}
            {memberships.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">
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
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
      {initial}
    </span>
  );
}

function StatusBadge({ status, suspendedAt }: { status: string; suspendedAt: Date | null }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    INVITED: "bg-blue-100 text-blue-700",
    SUSPENDED: "bg-red-100 text-red-700",
    REVOKED: "bg-gray-100 text-gray-700",
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
