import type { Prisma } from "@prisma/client";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { LogsFilters, type FilterOption } from "./logs-filters";

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    member?: string;
    connector?: string;
    tool?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await requireAdmin();
  const { member, connector, tool, from, to } = await searchParams;

  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  // `to` is a calendar day; include the whole day by extending to the next midnight.
  const toEnd = toDate ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000) : undefined;

  const where: Prisma.AuditLogWhereInput = {
    organizationId: session.organizationId,
    ...(member ? { membershipId: member } : {}),
    ...(connector ? { connectorId: connector } : {}),
    ...(tool ? { toolName: tool } : {}),
    ...(fromDate || toEnd
      ? {
          timestamp: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toEnd ? { lt: toEnd } : {}),
          },
        }
      : {}),
  };

  const [logs, memberships, connectors, toolNames] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 100,
      include: {
        membership: {
          include: { user: { select: { name: true, email: true } } },
        },
        connector: true,
      },
    }),
    prisma.orgMembership.findMany({
      where: { organizationId: session.organizationId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.connector.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.auditLog.findMany({
      where: { organizationId: session.organizationId },
      distinct: ["toolName"],
      orderBy: { toolName: "asc" },
      select: { toolName: true },
    }),
  ]);

  const memberOptions: FilterOption[] = memberships.map((m) => ({
    value: m.id,
    label: m.user.name || m.user.email,
  }));
  const connectorOptions: FilterOption[] = connectors.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const toolOptions: FilterOption[] = toolNames.map((t) => ({
    value: t.toolName,
    label: t.toolName,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold">Audit Logs</h1>

      <LogsFilters
        members={memberOptions}
        connectors={connectorOptions}
        tools={toolOptions}
      />

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium">Member</th>
              <th className="pb-2 font-medium">Connector</th>
              <th className="pb-2 font-medium">Tool</th>
              <th className="pb-2 font-medium">AI Decision</th>
              <th className="pb-2 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="py-3 text-muted-foreground">
                  {log.timestamp.toLocaleString()}
                </td>
                <td className="py-3">{log.membership.user.name || log.membership.user.email}</td>
                <td className="py-3">{log.connector?.name ?? "—"}</td>
                <td className="py-3">
                  <code className="text-xs">{log.toolName}</code>
                </td>
                <td className="py-3">
                  {log.aiDecision && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        log.aiDecision === "PASSED"
                          ? "bg-success/10 text-success"
                          : log.aiDecision === "BLOCKED"
                            ? "bg-destructive/10 text-destructive"
                            : log.aiDecision === "FILTERED"
                              ? "bg-warning/10 text-warning"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {log.aiDecision}
                    </span>
                  )}
                </td>
                <td className="py-3 text-muted-foreground">
                  {log.durationMs ? `${log.durationMs}ms` : "-"}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No audit logs match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
