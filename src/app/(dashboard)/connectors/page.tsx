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
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Members</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
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
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                    {c.type}
                  </span>
                </td>
                <td className="py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === "ACTIVE"
                        ? "bg-success/10 text-success"
                        : c.status === "ERROR"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="py-3 text-muted-foreground">{c._count.memberAccess}</td>
                <td className="py-3">
                  <Link
                    href={`/connectors/${c.id}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Configure
                  </Link>
                </td>
              </tr>
            ))}
            {connectors.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
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
