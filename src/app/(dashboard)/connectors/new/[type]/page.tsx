import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";
import { requireAdmin } from "@/lib/auth";
import { getCatalogEntry } from "@/lib/connectors-catalog";
import { ConnectorConfigForm } from "./connector-config-form";
import { CustomMcpWizard } from "./custom-mcp-wizard";

export default async function NewConnectorConfigPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  await requireAdmin();
  const { type } = await params;

  const entry = getCatalogEntry(type);
  if (!entry || !entry.available || !entry.credentialField) {
    notFound();
  }

  const Icon = entry.icon;

  return (
    <div className="max-w-lg">
      <Link
        href="/connectors/new"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <FiArrowLeft className="size-4" />
        Back to gallery
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
          <Icon className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{entry.label}</h1>
          <p className="text-sm text-muted-foreground">{entry.description}</p>
        </div>
      </div>

      {entry.type === "EXTERNAL_MCP" ? (
        <CustomMcpWizard />
      ) : (
        <ConnectorConfigForm
          type={entry.type}
          label={entry.label}
          credentialField={entry.credentialField}
        />
      )}
    </div>
  );
}
