import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { notFound } from "next/navigation";
import { MemberControls } from "./member-controls";
import { MemberEditForm } from "./member-edit-form";
import { McpEndpoint } from "./mcp-endpoint";
import { AccessManager } from "@/components/access/access-manager";
import { getMemberUsage, type UsageWindow } from "@/lib/usage";
import { formatCost } from "@/lib/pricing";

function UsageCard({ label, usage }: { label: string; usage: UsageWindow }) {
  const tokens = usage.inputTokens + usage.outputTokens;
  return (
    <div className="flex-1 rounded-md border border-border p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {formatCost(usage.costCents)}
        {usage.hasUnpriced && <span className="text-destructive">*</span>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
        {usage.inputTokens.toLocaleString()} in · {usage.outputTokens.toLocaleString()} out
        {" "}({tokens.toLocaleString()} total)
      </div>
    </div>
  );
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;

  const membership = await prisma.orgMembership.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      user: { select: { name: true, email: true, image: true } },
      connectorAccess: { include: { connector: true } },
      organization: true,
    },
  });

  if (!membership) notFound();

  const allConnectors = await prisma.connector.findMany({
    where: { organizationId: session.organizationId, status: "ACTIVE" },
  });

  // Accessible tools = enabled tools across the member's connectors, minus their
  // explicit per-tool denials ("allowed by default, deny specific tools").
  const connectorIds = membership.connectorAccess.map((ca) => ca.connectorId);
  const enabledTools = connectorIds.length
    ? await prisma.connectorTool.groupBy({
        by: ["connectorId"],
        where: { enabled: true, connectorId: { in: connectorIds } },
        _count: { _all: true },
      })
    : [];
  const enabledByConnector = new Map(
    enabledTools.map((t) => [t.connectorId, t._count._all])
  );
  const totalTools = connectorIds.length
    ? await prisma.connectorTool.groupBy({
        by: ["connectorId"],
        where: { connectorId: { in: connectorIds } },
        _count: { _all: true },
      })
    : [];
  const totalByConnector = new Map(
    totalTools.map((t) => [t.connectorId, t._count._all])
  );
  const denials = await prisma.memberToolAccess.findMany({
    where: {
      membershipId: membership.id,
      allowed: false,
      connectorTool: { enabled: true },
    },
    select: { connectorTool: { select: { connectorId: true } } },
  });
  const deniedByConnector = new Map<string, number>();
  for (const d of denials) {
    const cid = d.connectorTool.connectorId;
    deniedByConnector.set(cid, (deniedByConnector.get(cid) ?? 0) + 1);
  }
  const toolCount = membership.connectorAccess.reduce((sum, ca) => {
    const enabled = enabledByConnector.get(ca.connectorId) ?? 0;
    const denied = deniedByConnector.get(ca.connectorId) ?? 0;
    return sum + Math.max(0, enabled - denied);
  }, 0);

  const usage = await getMemberUsage(session.organizationId, membership.id);

  const config = getConfig();
  const mcpEndpoint = `${config.MCP_BASE_URL}/mcp/${membership.organization.slug}`;

  return (
    <div>
      <MemberEditForm
        membershipId={membership.id}
        sessionRole={session.role as "OWNER" | "ADMIN" | "MEMBER"}
        isSelf={membership.id === session.membershipId}
        stats={[
          { label: "Last active", value: formatDate(membership.lastActiveAt, "Never") },
          { label: "Updated", value: formatDate(membership.updatedAt) },
          { label: "Created", value: formatDate(membership.createdAt) },
          { label: "Connectors", value: String(membership.connectorAccess.length) },
          { label: "Tools", value: String(toolCount) },
        ]}
        initial={{
          name: membership.user.name || "",
          email: membership.user.email,
          image: membership.user.image,
          jobTitle: membership.jobTitle,
          responsibilities: membership.responsibilities,
          permissionInstructions: membership.permissionInstructions,
          role: membership.role,
        }}
      />

      <div className="mt-8 rounded-lg border border-border p-5">
        <h2 className="text-lg font-semibold">LLM usage &amp; cost</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Approximate cost of this member&apos;s chat turns through channels, priced
          from token counts in provider metadata. {usage.thisMonth.hasUnpriced || usage.sinceStart.hasUnpriced ? (
            <span className="text-destructive">* includes a model with no configured price (tokens counted, cost not).</span>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <UsageCard label="This month" usage={usage.thisMonth} />
          <UsageCard label="Since start" usage={usage.sinceStart} />
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-border p-5">
        <h2 className="text-lg font-semibold">Personal MCP Endpoint</h2>
        <McpEndpoint endpoint={mcpEndpoint} />
        <p className="mt-2 text-xs text-muted-foreground">
          Team member must authenticate to use this endpoint.
        </p>
      </div>

      <div className="mt-8">
        <AccessManager
            axis="connectors"
            fixedMembershipId={membership.id}
            title="Connector Access"
            description="Grant this team member access to connectors and tune what they can do."
            records={membership.connectorAccess.map((ca) => {
              const isMcp = ca.connector.type === "EXTERNAL_MCP";
              const enabled = enabledByConnector.get(ca.connectorId) ?? 0;
              const denied = deniedByConnector.get(ca.connectorId) ?? 0;
              return {
                id: ca.connectorId,
                label: ca.connector.name,
                connectorType: ca.connector.type,
                readAccess: ca.readAccess,
                writeAccess: ca.writeAccess,
                paused: ca.paused,
                aiInstructions: ca.aiInstructions,
                customScript: ca.customScript,
                toolCount: isMcp ? Math.max(0, enabled - denied) : undefined,
                totalToolCount: isMcp
                  ? totalByConnector.get(ca.connectorId) ?? 0
                  : undefined,
              };
            })}
            candidates={allConnectors
              .filter(
                (c) => !membership.connectorAccess.some((ca) => ca.connectorId === c.id)
              )
              .map((c) => ({
                id: c.id,
                label: c.name,
                connectorType: c.type,
              }))}
          />
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Suspend cuts off MCP access immediately. Remove deletes the member from this organization.
        </p>
        <div className="mt-3">
          <MemberControls
            isSelf={membership.id === session.membershipId}
            member={{
              id: membership.id,
              name: membership.user.name || "",
              email: membership.user.email,
              status: membership.status,
              suspendedAt: membership.suspendedAt,
              role: membership.role,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function formatDate(date: Date | null, fallback = "—"): string {
  if (!date) return fallback;
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
