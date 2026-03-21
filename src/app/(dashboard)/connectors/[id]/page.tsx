import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import { ConnectorControls } from "./connector-controls";

export default async function ConnectorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;

  const connector = await prisma.connector.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      tools: true,
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

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{connector.name}</h1>
          <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-mono">
            {connector.type}
          </span>
        </div>
        <ConnectorControls connector={connector} />
      </div>

      <div className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-medium text-gray-500">Configuration</h2>
        <pre className="mt-2 text-xs text-gray-600">
          {JSON.stringify(connector.config, null, 2)}
        </pre>
        <p className="mt-2 text-xs text-gray-400">
          Credentials are encrypted and not displayed.
        </p>
      </div>

      {connector.type === "EXTERNAL_MCP" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold">
            Discovered Tools ({connector.tools.length})
          </h2>
          {connector.tools.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              No tools discovered yet. Tools are discovered when the MCP server connects.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {connector.tools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3"
                >
                  <div>
                    <code className="text-sm font-medium">{tool.toolName}</code>
                    {tool.description && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {tool.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-xs ${tool.enabled ? "text-green-600" : "text-gray-400"}`}
                  >
                    {tool.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-lg font-semibold">
          Members with Access ({connector.memberAccess.length})
        </h2>
        {connector.memberAccess.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            No members have access to this connector.
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            {connector.memberAccess.map((ma) => (
              <div
                key={ma.id}
                className="flex items-center justify-between rounded-md border border-gray-100 bg-white px-4 py-2 text-sm"
              >
                <span>{ma.membership.user.name || ma.membership.user.email}</span>
                <div className="flex gap-2 text-xs text-gray-500">
                  {ma.readAccess && <span className="text-green-600">Read</span>}
                  {ma.writeAccess && <span className="text-blue-600">Write</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
