import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";
import { requireAdmin } from "@/lib/auth";
import { getLlmCatalogEntry } from "@/lib/llm-providers-catalog";
import { ProviderGlyph } from "@/components/provider-glyph";
import { LlmProviderForm } from "./llm-provider-form";

export default async function NewLlmProviderConfigPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  await requireAdmin();
  const { type } = await params;

  const entry = getLlmCatalogEntry(type);
  if (!entry) {
    notFound();
  }

  return (
    <div className="max-w-lg">
      <Link
        href="/llm-providers/new"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <FiArrowLeft className="size-4" />
        Back to gallery
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
          <ProviderGlyph logo={entry.logo} icon={entry.icon} className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{entry.label}</h1>
          <p className="text-sm text-muted-foreground">{entry.description}</p>
        </div>
      </div>

      <LlmProviderForm
        type={entry.type}
        label={entry.label}
        defaultBaseUrl={entry.defaultBaseUrl}
        baseUrlEditable={entry.baseUrlEditable}
        requiresApiKey={entry.requiresApiKey}
        suggestedModels={entry.suggestedModels}
      />
    </div>
  );
}
