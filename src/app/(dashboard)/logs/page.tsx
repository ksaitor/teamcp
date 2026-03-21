import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

export default async function LogsPage() {
  const session = await requireAdmin();

  const logs = await prisma.auditLog.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { timestamp: "desc" },
    take: 100,
    include: {
      membership: {
        include: { user: { select: { name: true, email: true } } },
      },
      connector: true,
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Audit Logs</h1>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium">Member</th>
              <th className="pb-2 font-medium">Connector</th>
              <th className="pb-2 font-medium">Tool</th>
              <th className="pb-2 font-medium">AI Decision</th>
              <th className="pb-2 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="py-3 text-gray-600">
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
                          ? "bg-green-100 text-green-700"
                          : log.aiDecision === "BLOCKED"
                            ? "bg-red-100 text-red-700"
                            : log.aiDecision === "FILTERED"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {log.aiDecision}
                    </span>
                  )}
                </td>
                <td className="py-3 text-gray-500">
                  {log.durationMs ? `${log.durationMs}ms` : "-"}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  No audit logs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
