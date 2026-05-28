import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ApprovalActions } from "./approval-actions";

export default async function ApprovalsPage() {
  const session = await requireAdmin();

  const approvals = await prisma.approvalRequest.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      membership: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  const pending = approvals.filter((a) => a.status === "PENDING");
  const resolved = approvals.filter((a) => a.status !== "PENDING");

  return (
    <div>
      <h1 className="text-2xl font-bold">Approval Queue</h1>

      {pending.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold">
            Pending ({pending.length})
          </h2>
          <div className="mt-2 space-y-3">
            {pending.map((approval) => (
              <div
                key={approval.id}
                className="rounded-md border border-warning/30 bg-warning/10 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">
                      {approval.membership.user.name || approval.membership.user.email} → {approval.connectorName} /{" "}
                      <code className="text-sm">{approval.toolName}</code>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      AI reasoning: {approval.aiReasoning}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expires: {approval.expiresAt.toLocaleString()}
                    </p>
                  </div>
                  <ApprovalActions approvalId={approval.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No pending approvals.</p>
      )}

      {resolved.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">History</h2>
          <div className="mt-2 space-y-2">
            {resolved.map((approval) => (
              <div
                key={approval.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">{approval.membership.user.name || approval.membership.user.email}</span>
                  {" → "}
                  <code className="text-xs">{approval.toolName}</code>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    approval.status === "APPROVED"
                      ? "bg-success/10 text-success"
                      : approval.status === "DENIED"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {approval.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
