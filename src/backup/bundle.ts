/**
 * Config bundle — the portable unit of a backup (and, later, a cloud
 * migration).
 *
 * A bundle is a versioned JSON snapshot of an organization's *configuration*:
 * settings, connectors, LLM providers, channels, members and their per-member
 * access. It deliberately excludes operational/session state (tokens, OAuth
 * codes, approvals, chat history, audit logs) — those are regenerated or
 * re-authed on the target instance.
 *
 * Secret fields are never emitted as raw plaintext. Each is tagged:
 *   - `enc: "instance"` → the existing AES-256-GCM ciphertext (`*Encrypted`
 *     column), copied verbatim. Restoring it requires the **same**
 *     ENCRYPTION_KEY. Used for browser/instance-key downloads and scheduled
 *     S3 backups.
 *   - `enc: "plain"`    → the decrypted secret. Only ever produced when the
 *     whole bundle will immediately be sealed under a passphrase
 *     (src/backup/archive.ts), so plaintext never lands at rest. This makes a
 *     backup portable to an instance with a *different* ENCRYPTION_KEY.
 */
import { prisma } from "@/db";
import { decrypt } from "@/lib/crypto";

export const BUNDLE_VERSION = 1;

export type SecretValue = { enc: "instance" | "plain"; value: string };

export interface ConfigBundle {
  version: number;
  exportedAt: string;
  organization: {
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  settings: BundleSettings | null;
  llmProviders: BundleLlmProvider[];
  connectors: BundleConnector[];
  channels: BundleChannel[];
  members: BundleMember[];
}

interface BundleSettings {
  notifyEmail: boolean;
  notifyWebhookUrl: string | null;
  notifySlackWebhookUrl: string | null;
  logRetentionDays: number;
  defaultSessionDurationHours: number;
  allowedAuthProviders: unknown;
  require2FA: boolean;
  aiFilterEnabled: boolean;
  aiModel: string;
  approvalTimeoutSecs: number;
  channelPersistMessageBodies: boolean;
  // LlmProvider ids aren't portable; reference by name and resolve on restore.
  defaultLlmProviderName: string | null;
}

interface BundleLlmProvider {
  name: string;
  type: string;
  baseUrl: string | null;
  defaultModel: string;
  config: unknown;
  status: string;
  apiKey: SecretValue | null;
}

interface BundleConnector {
  name: string;
  type: string;
  config: unknown;
  skipAiFilter: boolean;
  status: string;
  credentials: SecretValue | null;
  oauth: BundleConnectorOAuth | null;
  tools: BundleConnectorTool[];
}

interface BundleConnectorOAuth {
  serverUrl: string;
  scope: string | null;
  clientInfo: SecretValue | null;
  tokens: SecretValue | null;
  discoveryState: unknown;
}

interface BundleConnectorTool {
  toolName: string;
  description: string | null;
  inputSchema: unknown;
  enabled: boolean;
}

interface BundleChannel {
  name: string;
  type: string;
  status: string;
  config: unknown;
  modelOverride: string | null;
  defaultLlmProviderName: string | null;
  credentials: SecretValue | null;
}

interface BundleMember {
  email: string;
  name: string | null;
  role: string;
  status: string;
  jobTitle: string | null;
  responsibilities: string | null;
  permissionInstructions: string | null;
  sessionDurationHours: number | null;
  connectorAccess: BundleConnectorAccess[];
  toolAccess: BundleToolAccess[];
}

interface BundleConnectorAccess {
  connectorName: string;
  readAccess: boolean;
  writeAccess: boolean;
  nativePermissions: unknown;
  customScript: string | null;
  aiInstructions: string | null;
}

interface BundleToolAccess {
  connectorName: string;
  toolName: string;
  allowed: boolean;
  aiInstructionOverride: string | null;
}

/** Wrap a stored ciphertext (or decrypt it) into a tagged secret value. */
function packSecret(
  ciphertext: string | null,
  plaintextSecrets: boolean
): SecretValue | null {
  if (!ciphertext) return null;
  if (plaintextSecrets) return { enc: "plain", value: decrypt(ciphertext) };
  return { enc: "instance", value: ciphertext };
}

/**
 * Build a config bundle for an org.
 *
 * @param plaintextSecrets When true, secrets are decrypted into the bundle.
 *   The caller MUST seal the result under a passphrase before it leaves
 *   memory. When false (default), at-rest ciphertext is copied verbatim.
 */
export async function buildConfigBundle(
  organizationId: string,
  { plaintextSecrets = false }: { plaintextSecrets?: boolean } = {}
): Promise<ConfigBundle> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      settings: true,
      llmProviders: { orderBy: { createdAt: "asc" } },
      connectors: {
        orderBy: { createdAt: "asc" },
        include: { oauth: true, tools: { orderBy: { toolName: "asc" } } },
      },
      channels: { orderBy: { createdAt: "asc" } },
      memberships: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { email: true, name: true } },
          connectorAccess: { include: { connector: { select: { name: true } } } },
          toolAccess: {
            include: {
              connectorTool: {
                select: {
                  toolName: true,
                  connector: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!org) throw new Error("Organization not found");

  // Resolve the default LLM provider id → name (ids aren't portable).
  const providerNameById = new Map(org.llmProviders.map((p) => [p.id, p.name]));
  const defaultLlmProviderName = org.settings?.defaultLlmProviderId
    ? providerNameById.get(org.settings.defaultLlmProviderId) ?? null
    : null;

  return {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    organization: {
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
    },
    settings: org.settings
      ? {
          notifyEmail: org.settings.notifyEmail,
          notifyWebhookUrl: org.settings.notifyWebhookUrl,
          notifySlackWebhookUrl: org.settings.notifySlackWebhookUrl,
          logRetentionDays: org.settings.logRetentionDays,
          defaultSessionDurationHours: org.settings.defaultSessionDurationHours,
          allowedAuthProviders: org.settings.allowedAuthProviders,
          require2FA: org.settings.require2FA,
          aiFilterEnabled: org.settings.aiFilterEnabled,
          aiModel: org.settings.aiModel,
          approvalTimeoutSecs: org.settings.approvalTimeoutSecs,
          channelPersistMessageBodies: org.settings.channelPersistMessageBodies,
          defaultLlmProviderName,
        }
      : null,
    llmProviders: org.llmProviders.map((p) => ({
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl,
      defaultModel: p.defaultModel,
      config: p.config,
      status: p.status,
      apiKey: packSecret(p.apiKeyEncrypted, plaintextSecrets),
    })),
    connectors: org.connectors.map((c) => ({
      name: c.name,
      type: c.type,
      config: c.config,
      skipAiFilter: c.skipAiFilter,
      status: c.status,
      credentials: packSecret(c.credentialsEncrypted, plaintextSecrets),
      oauth: c.oauth
        ? {
            serverUrl: c.oauth.serverUrl,
            scope: c.oauth.scope,
            clientInfo: packSecret(c.oauth.clientInfoEnc, plaintextSecrets),
            tokens: packSecret(c.oauth.tokensEnc, plaintextSecrets),
            discoveryState: c.oauth.discoveryState,
          }
        : null,
      tools: c.tools.map((t) => ({
        toolName: t.toolName,
        description: t.description,
        inputSchema: t.inputSchema,
        enabled: t.enabled,
      })),
    })),
    channels: org.channels.map((ch) => ({
      name: ch.name,
      type: ch.type,
      status: ch.status,
      config: ch.config,
      modelOverride: ch.modelOverride,
      defaultLlmProviderName: ch.defaultLlmProviderId
        ? providerNameById.get(ch.defaultLlmProviderId) ?? null
        : null,
      credentials: packSecret(ch.credentialsEncrypted, plaintextSecrets),
    })),
    members: org.memberships.map((m) => ({
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      status: m.status,
      jobTitle: m.jobTitle,
      responsibilities: m.responsibilities,
      permissionInstructions: m.permissionInstructions,
      sessionDurationHours: m.sessionDurationHours,
      connectorAccess: m.connectorAccess.map((a) => ({
        connectorName: a.connector.name,
        readAccess: a.readAccess,
        writeAccess: a.writeAccess,
        nativePermissions: a.nativePermissions,
        customScript: a.customScript,
        aiInstructions: a.aiInstructions,
      })),
      toolAccess: m.toolAccess.map((t) => ({
        connectorName: t.connectorTool.connector.name,
        toolName: t.connectorTool.toolName,
        allowed: t.allowed,
        aiInstructionOverride: t.aiInstructionOverride,
      })),
    })),
  };
}
