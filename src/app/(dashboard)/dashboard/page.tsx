import { prisma } from "@/db";
import { requireSession } from "@/lib/auth";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await requireSession();

  const [memberCount, connectorCount, recentLogs, pendingApprovals] =
    await Promise.all([
      prisma.orgMembership.count({
        where: { organizationId: session.organizationId },
      }),
      prisma.connector.count({
        where: { organizationId: session.organizationId },
      }),
      prisma.auditLog.findMany({
        where: { organizationId: session.organizationId },
        orderBy: { timestamp: "desc" },
        take: 5,
        include: {
          membership: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      }),
      prisma.approvalRequest.count({
        where: {
          organizationId: session.organizationId,
          status: "PENDING",
        },
      }),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="mt-6 grid grid-cols-4 gap-4">
        <StatCard label="Members" value={memberCount} href="/members" />
        <StatCard label="Connectors" value={connectorCount} href="/connectors" />
        <StatCard label="Pending Approvals" value={pendingApprovals} href="/approvals" />
        <StatCard label="Recent Logs" value={recentLogs.length} href="/logs" />
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Recent Activity</h2>
        {recentLogs.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No activity yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">{log.membership.user.name || log.membership.user.email}</span>{" "}
                  called <code className="text-xs">{log.toolName}</code>
                </div>
                <div className="flex items-center gap-3">
                  {log.aiDecision && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        log.aiDecision === "PASSED"
                          ? "bg-green-100 text-green-700"
                          : log.aiDecision === "BLOCKED"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {log.aiDecision}
                    </span>
                  )}
                  <span className="text-gray-400">
                    {log.timestamp.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300"
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </Link>
  );
}
