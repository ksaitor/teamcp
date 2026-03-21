import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { AddConnectorForm } from "./add-connector-form";

export default async function ConnectorsPage() {
  const session = await requireAdmin();

  const connectors = await prisma.connector.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { memberAccess: true, tools: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Connectors</h1>
      </div>

      <AddConnectorForm />

      <div className="mt-6">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Members</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {connectors.map((c) => (
              <tr key={c.id}>
                <td className="py-3">
                  <Link
                    href={`/connectors/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="py-3">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono">
                    {c.type}
                  </span>
                </td>
                <td className="py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === "ACTIVE"
                        ? "bg-green-100 text-green-700"
                        : c.status === "ERROR"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="py-3 text-gray-600">{c._count.memberAccess}</td>
                <td className="py-3">
                  <Link
                    href={`/connectors/${c.id}`}
                    className="text-gray-500 hover:text-gray-900"
                  >
                    Configure
                  </Link>
                </td>
              </tr>
            ))}
            {connectors.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">
                  No connectors yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
