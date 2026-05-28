import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { notFound } from "next/navigation";
import { MemberControls } from "./member-controls";
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
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {membership.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={membership.user.image}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-medium text-muted-foreground">
              {(membership.user.name || membership.user.email).charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold">{membership.user.name || membership.user.email}</h1>
            {membership.jobTitle && (
              <p className="mt-1 text-sm font-medium text-muted-foreground">{membership.jobTitle}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">{membership.user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">Role: {membership.role}</p>
          </div>
        </div>
        <MemberControls member={{
          id: membership.id,
          name: membership.user.name || "",
          email: membership.user.email,
          status: membership.status,
          suspendedAt: membership.suspendedAt,
          role: membership.role,
        }} />
      </div>

      <div className="mt-6 rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">MCP Endpoint</h2>
        <code className="mt-1 block text-sm">{mcpEndpoint}</code>
        <p className="mt-2 text-xs text-muted-foreground">
          Member must authenticate to use this endpoint.
        </p>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Permission Instructions</h2>
        <p className="text-sm text-muted-foreground">
          Natural language instructions for AI filtering (applies to all connectors).
        </p>
        <PermissionInstructionsForm
          membershipId={membership.id}
          instructions={membership.permissionInstructions}
        />
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
    </div>
  );
}

function PermissionInstructionsForm({
  membershipId,
  instructions,
}: {
  membershipId: string;
  instructions: string | null;
}) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        const { requireAdmin } = await import("@/lib/auth");
        const { revalidatePath } = await import("next/cache");
        const { prisma } = await import("@/db");
        const session = await requireAdmin();
        await prisma.orgMembership.update({
          where: { id: membershipId, organizationId: session.organizationId },
          data: { permissionInstructions: formData.get("instructions") as string || null },
        });
        revalidatePath(`/members/${membershipId}`);
      }}
    >
      <textarea
        name="instructions"
        defaultValue={instructions || ""}
        placeholder="e.g., Marketing team member. No access to financial data, API keys, or employee salaries."
        rows={3}
        className="mt-2 w-full rounded-md border border-input px-3 py-2 text-sm focus:border-ring focus:outline-none"
      />
      <button
        type="submit"
        className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Save
      </button>
    </form>
  );
}
