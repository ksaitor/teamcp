import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FiSettings, FiBox } from "react-icons/fi";
import { getCatalogEntryForConnector } from "@/lib/connectors-catalog";

export default async function ConnectorsPage() {
  const session = await requireAdmin();

  const connectors = await prisma.connector.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { memberAccess: true, tools: true } },
    },
  });

  if (connectors.length === 0) {
    redirect("/connectors/new");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Connectors</h1>
        <Link
          href="/connectors/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add connector
        </Link>
      </div>

      <div className="mt-6">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Team members</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {connectors.map((c) => {
              const Icon = getCatalogEntryForConnector(c)?.icon ?? FiBox;
              return (
              <tr key={c.id}>
                <td className="py-3">
                  <Link
                    href={`/connectors/${c.id}`}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    {c.name}
                  </Link>
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
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <FiSettings className="h-4 w-4" />
                    Configure
                  </Link>
                </td>
              </tr>
              );
            })}
            {connectors.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  No connectors yet. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
