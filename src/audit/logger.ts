import { prisma } from "@/db";
import { redactSecrets } from "./redactor";

export interface AuditEntry {
  membershipId: string;
  connectorId: string | null;
  organizationId: string;
  toolName: string;
  requestParams: Record<string, any>;
  responseSummary?: string;
  aiDecision: "PASSED" | "FILTERED" | "BLOCKED" | "QUEUED" | "SKIPPED";
  aiReasoning?: string;
  scriptResult?: Record<string, any>;
  durationMs?: number;
}

export async function createAuditLog(entry: AuditEntry) {
  return prisma.auditLog.create({
    data: {
      membershipId: entry.membershipId,
      connectorId: entry.connectorId,
      organizationId: entry.organizationId,
      toolName: entry.toolName,
      requestParams: redactSecrets(entry.requestParams) as any,
      responseSummary: entry.responseSummary
        ? redactSecrets(entry.responseSummary).substring(0, 1024)
        : undefined,
      aiDecision: entry.aiDecision,
      aiReasoning: entry.aiReasoning,
      scriptResult: entry.scriptResult as any,
      durationMs: entry.durationMs,
    },
  });
}
