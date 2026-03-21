import { prisma } from "@/db";
import { dispatchNotification } from "./notifications";

interface ApprovalContext {
  membershipId: string;
  organizationId: string;
  connectorName: string;
  toolName: string;
  requestParams: Record<string, any>;
  responseData: string;
  aiReasoning: string;
}

/**
 * Create an approval request and wait for admin decision.
 */
export async function createApprovalAndWait(
  ctx: ApprovalContext,
  timeoutSecs: number = 300
): Promise<"APPROVED" | "DENIED" | "EXPIRED"> {
  const expiresAt = new Date(Date.now() + timeoutSecs * 1000);

  const approval = await prisma.approvalRequest.create({
    data: {
      membershipId: ctx.membershipId,
      organizationId: ctx.organizationId,
      connectorName: ctx.connectorName,
      toolName: ctx.toolName,
      requestContext: {
        params: ctx.requestParams,
        responsePreview: ctx.responseData.substring(0, 500),
      } as any,
      aiReasoning: ctx.aiReasoning,
      expiresAt,
    },
  });

  // Dispatch notifications
  await dispatchNotification(ctx.organizationId, {
    type: "approval_needed",
    approvalId: approval.id,
    memberName: ctx.membershipId,
    toolName: ctx.toolName,
    connectorName: ctx.connectorName,
  });

  // Poll for admin response (with timeout)
  const pollInterval = 2000;
  const maxPolls = Math.ceil((timeoutSecs * 1000) / pollInterval);

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const updated = await prisma.approvalRequest.findUnique({
      where: { id: approval.id },
    });

    if (!updated) return "DENIED";

    if (updated.status === "APPROVED") return "APPROVED";
    if (updated.status === "DENIED") return "DENIED";

    if (new Date() > updated.expiresAt) {
      await prisma.approvalRequest.update({
        where: { id: approval.id },
        data: { status: "EXPIRED" },
      });
      return "EXPIRED";
    }
  }

  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: { status: "EXPIRED" },
  });
  return "EXPIRED";
}
