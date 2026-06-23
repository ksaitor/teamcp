import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";
import { requireAdmin } from "@/lib/auth";
import { getCatalogEntry } from "@/lib/connectors-catalog";
import { xeroRedirectUri } from "@/connectors/xero/oauth";
import { ConnectorConfigForm } from "./connector-config-form";
import { CustomMcpWizard } from "./custom-mcp-wizard";
import { WebRequestForm } from "./web-request-form";
import { XeroWizard } from "./xero-wizard";

export default async function NewConnectorConfigPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  await requireAdmin();
  const { type } = await params;

  const entry = getCatalogEntry(type);
  if (!entry || !entry.available) {
    notFound();
  }
  // A connector is configurable if it's one of the built-in OAuth/MCP flows, or
  // it brings its own co-located form, or it declares a single credential field.
  const OAUTH_OR_MCP_TYPES = new Set(["EXTERNAL_MCP", "XERO", "WEB_REQUEST"]);
  const CustomForm = entry.form;
  if (
    !OAUTH_OR_MCP_TYPES.has(entry.type) &&
    !CustomForm &&
    !entry.credentialField
  ) {
    notFound();
  }

  const Icon = entry.icon;

  const wide = entry.type === "WEB_REQUEST";

  return (
    <div className={wide ? "max-w-3xl" : "max-w-lg"}>
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
        <CustomMcpWizard preset={entry.mcpPreset} />
      ) : entry.type === "XERO" ? (
        <XeroWizard redirectUri={xeroRedirectUri()} />
      ) : entry.type === "WEB_REQUEST" ? (
        <WebRequestForm />
      ) : CustomForm ? (
        <CustomForm />
      ) : entry.credentialField ? (
        <ConnectorConfigForm
          type={entry.type}
          label={entry.label}
          credentialField={entry.credentialField}
        />
      ) : null}
    </div>
  );
}
