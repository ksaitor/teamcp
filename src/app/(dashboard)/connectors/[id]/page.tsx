import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import { ConnectorControls } from "./connector-controls";
import { ToolList } from "./tool-list";
import { ReauthBanner } from "./reauth-banner";
import { XeroTenantPicker } from "./xero-tenant-picker";
import { AccessManager } from "@/components/access/access-manager";

export default async function ConnectorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;

  const connector = await prisma.connector.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      tools: { orderBy: { toolName: "asc" } },
      oauth: true,
      memberAccess: {
        include: {
          membership: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  if (!connector) notFound();

  const members = await prisma.orgMembership.findMany({
    where: { organizationId: session.organizationId, status: "ACTIVE" },
    include: { user: { select: { name: true, email: true } } },
  });

  const isExternalMcp = connector.type === "EXTERNAL_MCP";
  const isXero = connector.type === "XERO";
  const config = (connector.config ?? {}) as Record<string, any>;

  const xeroOrgs =
    (connector.oauth?.discoveryState as { xeroOrgs?: { tenantId: string; tenantName: string }[] } | null)
      ?.xeroOrgs ?? [];
  const xeroNeedsOrgPick =
    isXero && connector.status === "PENDING" && xeroOrgs.length > 0;
  const xeroNeedsReauth =
    isXero && !xeroNeedsOrgPick &&
    (connector.status === "ERROR" || connector.status === "PENDING");

  const tools = connector.tools.map((t) => ({
    id: t.id,
    toolName: t.toolName,
    description: t.description,
    enabled: t.enabled,
  }));

  const accessRecords = connector.memberAccess.map((ma) => ({
    id: ma.membershipId,
    label: ma.membership.user.name || ma.membership.user.email,
    sublabel: ma.membership.jobTitle || ma.membership.role,
    connectorType: connector.type,
    readAccess: ma.readAccess,
    writeAccess: ma.writeAccess,
    aiInstructions: ma.aiInstructions,
    customScript: ma.customScript,
  }));

  const grantedIds = new Set(connector.memberAccess.map((ma) => ma.membershipId));
  const candidates = members
    .filter((m) => !grantedIds.has(m.id))
    .map((m) => ({
      id: m.id,
      label: m.user.name || m.user.email,
      sublabel: m.jobTitle || m.role,
      connectorType: connector.type,
    }));

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{connector.name}</h1>
          <span className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs font-mono">
            {connector.type}
          </span>
        </div>
        <ConnectorControls connector={connector} />
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isExternalMcp &&
        (connector.status === "PENDING" || connector.status === "ERROR") && (
          <ReauthBanner
            connectorId={connector.id}
            status={connector.status}
            authMode={config.authMode}
          />
        )}

      {xeroNeedsOrgPick && (
        <XeroTenantPicker connectorId={connector.id} orgs={xeroOrgs} />
      )}

      {xeroNeedsReauth && (
        <ReauthBanner
          connectorId={connector.id}
          status={connector.status}
          authMode="oauth"
          startPath={`/api/connectors/${connector.id}/xero/start`}
        />
      )}

      <div className="mt-6 rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Configuration</h2>
        <pre className="mt-2 text-xs text-muted-foreground">
          {JSON.stringify(connector.config, null, 2)}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Credentials are encrypted and not displayed.
        </p>
      </div>

      {isExternalMcp && <ToolList connectorId={connector.id} tools={tools} />}

      <div className="mt-6">
        <h2 className="text-lg font-semibold">
          Member access ({accessRecords.length})
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant team members access to this connector and tune what they can do.
        </p>
        <div className="mt-3">
          <AccessManager
            axis="members"
            fixedConnectorId={connector.id}
            records={accessRecords}
            candidates={candidates}
          />
        </div>
      </div>
    </div>
  );
}
