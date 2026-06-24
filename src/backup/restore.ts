/**
 * Restore a {@link ConfigBundle} into an existing organization.
 *
 * Restore is an idempotent **merge** keyed on natural keys (connector/provider/
 * channel name, member email) scoped to the target org — re-running a restore
 * updates in place rather than duplicating. Org identity (name/slug) is left
 * untouched; only configuration is restored.
 *
 * Secret handling mirrors how the bundle was built:
 *   - `enc: "instance"` ciphertext is stored verbatim (decryptable only if the
 *     target instance shares the source ENCRYPTION_KEY).
 *   - `enc: "plain"` (passphrase backups) is re-encrypted with the target
 *     instance's ENCRYPTION_KEY.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/db";
import { encrypt, generateToken } from "@/lib/crypto";
import { BUNDLE_VERSION, type ConfigBundle, type SecretValue } from "./bundle";

export interface RestoreReport {
  dryRun: boolean;
  settings: "restored" | "skipped";
  llmProviders: { created: number; updated: number };
  connectors: { created: number; updated: number };
  channels: { created: number; updated: number };
  members: { created: number; updated: number };
  warnings: string[];
}

/** Resolve a tagged secret to the ciphertext to persist. */
function unpackSecret(secret: SecretValue | null | undefined): string | null {
  if (!secret) return null;
  return secret.enc === "plain" ? encrypt(secret.value) : secret.value;
}

function hasInstanceSecrets(bundle: ConfigBundle): boolean {
  const tagged: (SecretValue | null)[] = [
    ...bundle.llmProviders.map((p) => p.apiKey),
    ...bundle.connectors.flatMap((c) => [
      c.credentials,
      c.oauth?.clientInfo ?? null,
      c.oauth?.tokens ?? null,
    ]),
    ...bundle.channels.map((c) => c.credentials),
  ];
  return tagged.some((s) => s?.enc === "instance");
}

export async function restoreBundle(
  organizationId: string,
  bundle: ConfigBundle,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<RestoreReport> {
  if (typeof bundle?.version !== "number") {
    throw new Error("Invalid backup: missing version.");
  }
  if (bundle.version > BUNDLE_VERSION) {
    throw new Error(
      `This backup was created by a newer version (v${bundle.version}). Upgrade Teamcp before restoring.`
    );
  }

  const warnings: string[] = [];
  if (hasInstanceSecrets(bundle)) {
    warnings.push(
      "This backup stores secrets under the original instance's ENCRYPTION_KEY. Credentials only work if this instance shares that key."
    );
  }
  if (bundle.channels.length > 0) {
    warnings.push(
      "Channels were restored — re-check their webhook delivery, secrets are regenerated for new channels."
    );
  }

  // ── Dry run: report planned creates/updates without writing ──────────
  if (dryRun) {
    const [providers, connectors, channels, memberships] = await Promise.all([
      prisma.llmProvider.findMany({ where: { organizationId }, select: { name: true } }),
      prisma.connector.findMany({ where: { organizationId }, select: { name: true } }),
      prisma.channel.findMany({ where: { organizationId }, select: { name: true } }),
      prisma.orgMembership.findMany({
        where: { organizationId },
        select: { user: { select: { email: true } } },
      }),
    ]);
    const split = (incoming: string[], existing: Set<string>) => {
      let created = 0;
      let updated = 0;
      for (const name of incoming) (existing.has(name) ? updated++ : created++);
      return { created, updated };
    };
    return {
      dryRun: true,
      settings: bundle.settings ? "restored" : "skipped",
      llmProviders: split(
        bundle.llmProviders.map((p) => p.name),
        new Set(providers.map((p) => p.name))
      ),
      connectors: split(
        bundle.connectors.map((c) => c.name),
        new Set(connectors.map((c) => c.name))
      ),
      channels: split(
        bundle.channels.map((c) => c.name),
        new Set(channels.map((c) => c.name))
      ),
      members: split(
        bundle.members.map((m) => m.email),
        new Set(memberships.map((m) => m.user.email))
      ),
      warnings,
    };
  }

  // ── Commit ───────────────────────────────────────────────────────────
  const report: RestoreReport = {
    dryRun: false,
    settings: "skipped",
    llmProviders: { created: 0, updated: 0 },
    connectors: { created: 0, updated: 0 },
    channels: { created: 0, updated: 0 },
    members: { created: 0, updated: 0 },
    warnings,
  };

  await prisma.$transaction(async (tx) => {
    // Logo (org name/slug intentionally left as-is).
    await tx.organization.update({
      where: { id: organizationId },
      data: { logoUrl: bundle.organization.logoUrl },
    });

    // LLM providers — upsert by name, build name→id map.
    const providerIdByName = new Map<string, string>();
    for (const p of bundle.llmProviders) {
      const existing = await tx.llmProvider.findFirst({
        where: { organizationId, name: p.name },
        select: { id: true },
      });
      const data = {
        type: p.type as any,
        baseUrl: p.baseUrl,
        defaultModel: p.defaultModel,
        config: (p.config ?? {}) as Prisma.InputJsonValue,
        status: p.status as any,
        apiKeyEncrypted: unpackSecret(p.apiKey),
      };
      if (existing) {
        await tx.llmProvider.update({ where: { id: existing.id }, data });
        providerIdByName.set(p.name, existing.id);
        report.llmProviders.updated++;
      } else {
        const created = await tx.llmProvider.create({
          data: { organizationId, name: p.name, ...data },
        });
        providerIdByName.set(p.name, created.id);
        report.llmProviders.created++;
      }
    }

    // Org settings.
    if (bundle.settings) {
      const s = bundle.settings;
      const defaultLlmProviderId = s.defaultLlmProviderName
        ? providerIdByName.get(s.defaultLlmProviderName) ?? null
        : null;
      await tx.orgSettings.upsert({
        where: { organizationId },
        update: {
          notifyEmail: s.notifyEmail,
          notifyWebhookUrl: s.notifyWebhookUrl,
          notifySlackWebhookUrl: s.notifySlackWebhookUrl,
          logRetentionDays: s.logRetentionDays,
          defaultSessionDurationHours: s.defaultSessionDurationHours,
          allowedAuthProviders: s.allowedAuthProviders as Prisma.InputJsonValue,
          require2FA: s.require2FA,
          aiFilterEnabled: s.aiFilterEnabled,
          aiModel: s.aiModel,
          approvalTimeoutSecs: s.approvalTimeoutSecs,
          channelPersistMessageBodies: s.channelPersistMessageBodies,
          defaultLlmProviderId,
        },
        create: {
          organizationId,
          notifyEmail: s.notifyEmail,
          notifyWebhookUrl: s.notifyWebhookUrl,
          notifySlackWebhookUrl: s.notifySlackWebhookUrl,
          logRetentionDays: s.logRetentionDays,
          defaultSessionDurationHours: s.defaultSessionDurationHours,
          allowedAuthProviders: s.allowedAuthProviders as Prisma.InputJsonValue,
          require2FA: s.require2FA,
          aiFilterEnabled: s.aiFilterEnabled,
          aiModel: s.aiModel,
          approvalTimeoutSecs: s.approvalTimeoutSecs,
          channelPersistMessageBodies: s.channelPersistMessageBodies,
          defaultLlmProviderId,
        },
      });
      report.settings = "restored";
    }

    // Connectors — upsert by name, plus 1:1 OAuth and tools.
    const connectorIdByName = new Map<string, string>();
    for (const c of bundle.connectors) {
      const existing = await tx.connector.findFirst({
        where: { organizationId, name: c.name },
        select: { id: true },
      });
      const data = {
        type: c.type,
        config: (c.config ?? {}) as Prisma.InputJsonValue,
        skipAiFilter: c.skipAiFilter,
        status: c.status as any,
        credentialsEncrypted: unpackSecret(c.credentials) ?? "",
      };
      let connectorId: string;
      if (existing) {
        await tx.connector.update({ where: { id: existing.id }, data });
        connectorId = existing.id;
        report.connectors.updated++;
      } else {
        const created = await tx.connector.create({
          data: { organizationId, name: c.name, ...data },
        });
        connectorId = created.id;
        report.connectors.created++;
      }
      connectorIdByName.set(c.name, connectorId);

      if (c.oauth) {
        await tx.connectorOAuth.upsert({
          where: { connectorId },
          update: {
            serverUrl: c.oauth.serverUrl,
            scope: c.oauth.scope,
            clientInfoEnc: unpackSecret(c.oauth.clientInfo),
            tokensEnc: unpackSecret(c.oauth.tokens),
            discoveryState: (c.oauth.discoveryState ?? undefined) as Prisma.InputJsonValue,
          },
          create: {
            connectorId,
            serverUrl: c.oauth.serverUrl,
            scope: c.oauth.scope,
            clientInfoEnc: unpackSecret(c.oauth.clientInfo),
            tokensEnc: unpackSecret(c.oauth.tokens),
            discoveryState: (c.oauth.discoveryState ?? undefined) as Prisma.InputJsonValue,
          },
        });
      }

      for (const t of c.tools) {
        await tx.connectorTool.upsert({
          where: { connectorId_toolName: { connectorId, toolName: t.toolName } },
          update: {
            description: t.description,
            inputSchema: (t.inputSchema ?? undefined) as Prisma.InputJsonValue,
            enabled: t.enabled,
          },
          create: {
            connectorId,
            toolName: t.toolName,
            description: t.description,
            inputSchema: (t.inputSchema ?? undefined) as Prisma.InputJsonValue,
            enabled: t.enabled,
          },
        });
      }
    }

    // Channels — upsert by name; regenerate webhookSecret for new ones.
    for (const ch of bundle.channels) {
      const defaultLlmProviderId = ch.defaultLlmProviderName
        ? providerIdByName.get(ch.defaultLlmProviderName) ?? null
        : null;
      const existing = await tx.channel.findFirst({
        where: { organizationId, name: ch.name },
        select: { id: true },
      });
      const data = {
        type: ch.type as any,
        status: ch.status as any,
        config: (ch.config ?? {}) as Prisma.InputJsonValue,
        modelOverride: ch.modelOverride,
        defaultLlmProviderId,
        credentialsEncrypted: unpackSecret(ch.credentials),
      };
      if (existing) {
        await tx.channel.update({ where: { id: existing.id }, data });
        report.channels.updated++;
      } else {
        await tx.channel.create({
          data: { organizationId, name: ch.name, webhookSecret: generateToken(), ...data },
        });
        report.channels.created++;
      }
    }

    // Members — upsert User by email + OrgMembership, then per-member access.
    for (const m of bundle.members) {
      const user = await tx.user.upsert({
        where: { email: m.email },
        update: {},
        create: { email: m.email, name: m.name },
        select: { id: true },
      });
      const existingMembership = await tx.orgMembership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId } },
        select: { id: true },
      });
      const memberData = {
        role: m.role as any,
        status: m.status as any,
        jobTitle: m.jobTitle,
        responsibilities: m.responsibilities,
        permissionInstructions: m.permissionInstructions,
        sessionDurationHours: m.sessionDurationHours,
      };
      let membershipId: string;
      if (existingMembership) {
        await tx.orgMembership.update({ where: { id: existingMembership.id }, data: memberData });
        membershipId = existingMembership.id;
        report.members.updated++;
      } else {
        const created = await tx.orgMembership.create({
          data: { userId: user.id, organizationId, ...memberData },
        });
        membershipId = created.id;
        report.members.created++;
      }

      for (const a of m.connectorAccess) {
        const connectorId = connectorIdByName.get(a.connectorName);
        if (!connectorId) continue;
        await tx.memberConnectorAccess.upsert({
          where: { membershipId_connectorId: { membershipId, connectorId } },
          update: {
            readAccess: a.readAccess,
            writeAccess: a.writeAccess,
            nativePermissions: (a.nativePermissions ?? undefined) as Prisma.InputJsonValue,
            customScript: a.customScript,
            aiInstructions: a.aiInstructions,
          },
          create: {
            membershipId,
            connectorId,
            readAccess: a.readAccess,
            writeAccess: a.writeAccess,
            nativePermissions: (a.nativePermissions ?? undefined) as Prisma.InputJsonValue,
            customScript: a.customScript,
            aiInstructions: a.aiInstructions,
          },
        });
      }

      for (const t of m.toolAccess) {
        const connectorId = connectorIdByName.get(t.connectorName);
        if (!connectorId) continue;
        const tool = await tx.connectorTool.findUnique({
          where: { connectorId_toolName: { connectorId, toolName: t.toolName } },
          select: { id: true },
        });
        if (!tool) continue;
        await tx.memberToolAccess.upsert({
          where: {
            membershipId_connectorToolId: { membershipId, connectorToolId: tool.id },
          },
          update: { allowed: t.allowed, aiInstructionOverride: t.aiInstructionOverride },
          create: {
            membershipId,
            connectorToolId: tool.id,
            allowed: t.allowed,
            aiInstructionOverride: t.aiInstructionOverride,
          },
        });
      }
    }
  });

  return report;
}
