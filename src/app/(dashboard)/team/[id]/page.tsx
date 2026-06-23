import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { notFound } from "next/navigation";
import { MemberControls } from "./member-controls";
import { MemberEditForm } from "./member-edit-form";
import { McpEndpoint } from "./mcp-endpoint";
import { AccessManager } from "@/components/access/access-manager";

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

  const config = getConfig();
  const mcpEndpoint = `${config.MCP_BASE_URL}/mcp/${membership.organization.slug}`;

  return (
    <div>
      <MemberEditForm
        membershipId={membership.id}
        sessionRole={session.role as "OWNER" | "ADMIN" | "MEMBER"}
        isSelf={membership.id === session.membershipId}
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
        <h2 className="text-lg font-semibold">Personal MCP Endpoint</h2>
        <McpEndpoint endpoint={mcpEndpoint} />
        <p className="mt-2 text-xs text-muted-foreground">
          Member must authenticate to use this endpoint.
        </p>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Connector Access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant this member access to connectors and tune what they can do.
        </p>
        <div className="mt-3">
          <AccessManager
            axis="connectors"
            fixedMembershipId={membership.id}
            records={membership.connectorAccess.map((ca) => ({
              id: ca.connectorId,
              label: ca.connector.name,
              connectorType: ca.connector.type,
              readAccess: ca.readAccess,
              writeAccess: ca.writeAccess,
              aiInstructions: ca.aiInstructions,
              customScript: ca.customScript,
            }))}
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
