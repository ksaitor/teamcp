import Link from "next/link";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ProvidersList } from "./providers-list";

export default async function LlmProvidersPage() {
  const session = await requireAdmin();

  const [providers, settings] = await Promise.all([
    prisma.llmProvider.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.orgSettings.findUnique({
      where: { organizationId: session.organizationId },
      select: { defaultLlmProviderId: true },
    }),
  ]);

  const items = providers.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    defaultModel: p.defaultModel,
    baseUrl: p.baseUrl,
    status: p.status,
    hasApiKey: !!p.apiKeyEncrypted,
    isDefault: settings?.defaultLlmProviderId === p.id,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">AI Models</h1>
        <Link
          href="/models/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add provider
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        LLM providers your team can use. The default powers the AI access filter.
      </p>

      <div className="mt-6">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No AI model providers yet. Add one to get started.
          </p>
        ) : (
          <ProvidersList items={items} />
        )}
      </div>
    </div>
  );
}
