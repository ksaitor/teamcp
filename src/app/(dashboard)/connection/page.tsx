import { prisma } from "@/db";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { ConnectionTokens } from "./connection-tokens";

export default async function ConnectionPage() {
  const { userId } = await requireUser();

  const memberships = await prisma.orgMembership.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      organization: { select: { name: true, slug: true } },
      mcpTokens: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          lastUsedAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const { MCP_BASE_URL } = getConfig();

  return (
    <div>
      <h1 className="text-2xl font-bold">Connection</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect your MCP client to each organization you belong to. Each
        organization has its own endpoint and access token.
      </p>

      {memberships.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          You are not an active member of any organization yet.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {memberships.map((m) => {
            const endpoint = `${MCP_BASE_URL}/mcp/${m.organization.slug}`;
            return (
              <div
                key={m.id}
                className="rounded-md border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {m.organization.name}
                  </h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {m.role}
                  </span>
                </div>

                <div className="mt-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    MCP Endpoint
                  </h3>
                  <code className="mt-1 block break-all text-sm">{endpoint}</code>
                </div>

                <div className="mt-4">
                  <ConnectionTokens
                    membershipId={m.id}
                    tokens={m.mcpTokens.map((t) => ({
                      id: t.id,
                      createdAt: t.createdAt.toISOString(),
                      expiresAt: t.expiresAt.toISOString(),
                      lastUsedAt: t.lastUsedAt.toISOString(),
                    }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
