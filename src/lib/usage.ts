import { prisma } from "@/db";
import { priceUsageCents } from "./pricing";

/**
 * Read-side aggregation of approximate per-member LLM usage.
 *
 * Usage is recorded per chat turn as token counts + the billed model id on the
 * assistant `Message` row (see src/agent/run.ts), straight from provider
 * response metadata — we never re-tokenize. This module rolls those rows up per
 * member, for two windows (this calendar month and since start), and prices
 * them at read time via src/lib/pricing.ts.
 *
 * Scope note: this covers chat turns through channels. AI-filter LLM calls are
 * not counted here — they'd live on AuditLog, which the retention sweep prunes,
 * so a "since start" total there would silently erode.
 */
export interface UsageWindow {
  inputTokens: number;
  outputTokens: number;
  /** Approximate USD cents; null portion (unpriced models) excluded. */
  costCents: number;
  /** True if some tokens came from a model with no price entry. */
  hasUnpriced: boolean;
}

export interface MemberUsage {
  thisMonth: UsageWindow;
  sinceStart: UsageWindow;
}

const EMPTY: UsageWindow = {
  inputTokens: 0,
  outputTokens: 0,
  costCents: 0,
  hasUnpriced: false,
};

interface UsageRow {
  membership_id: string;
  model: string | null;
  in_tok: bigint;
  out_tok: bigint;
}

// Sum assistant-message token usage per (member, model) for one org, optionally
// limited to rows on/after `since`. Joins Message → Conversation → OrgMembership
// so a single query covers every member.
async function aggregate(
  organizationId: string,
  since: Date | null
): Promise<UsageRow[]> {
  if (since) {
    return prisma.$queryRaw<UsageRow[]>`
      SELECT om.id AS membership_id, m.model AS model,
             COALESCE(SUM(m."inputTokens"), 0)::bigint AS in_tok,
             COALESCE(SUM(m."outputTokens"), 0)::bigint AS out_tok
      FROM "Message" m
      JOIN "Conversation" c ON m."conversationId" = c.id
      JOIN "OrgMembership" om ON c."membershipId" = om.id
      WHERE om."organizationId" = ${organizationId}
        AND m.role = 'ASSISTANT'
        AND m."inputTokens" IS NOT NULL
        AND m."createdAt" >= ${since}
      GROUP BY om.id, m.model`;
  }
  return prisma.$queryRaw<UsageRow[]>`
    SELECT om.id AS membership_id, m.model AS model,
           COALESCE(SUM(m."inputTokens"), 0)::bigint AS in_tok,
           COALESCE(SUM(m."outputTokens"), 0)::bigint AS out_tok
    FROM "Message" m
    JOIN "Conversation" c ON m."conversationId" = c.id
    JOIN "OrgMembership" om ON c."membershipId" = om.id
    WHERE om."organizationId" = ${organizationId}
      AND m.role = 'ASSISTANT'
      AND m."inputTokens" IS NOT NULL
    GROUP BY om.id, m.model`;
}

/** Start of the current calendar month in UTC. */
function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function fold(rows: UsageRow[]): Map<string, UsageWindow> {
  const out = new Map<string, UsageWindow>();
  for (const row of rows) {
    const input = Number(row.in_tok);
    const output = Number(row.out_tok);
    const cents = priceUsageCents(row.model, input, output);
    const acc = out.get(row.membership_id) ?? { ...EMPTY };
    acc.inputTokens += input;
    acc.outputTokens += output;
    if (cents === null) acc.hasUnpriced = true;
    else acc.costCents += cents;
    out.set(row.membership_id, acc);
  }
  return out;
}

/**
 * Per-member usage for every member of an org, keyed by membershipId. Members
 * with no recorded usage are simply absent from the maps (callers default to
 * zero). Two windowed queries — fine for the small teams this product targets.
 */
export async function getOrgUsage(
  organizationId: string
): Promise<Map<string, MemberUsage>> {
  const [monthRows, allRows] = await Promise.all([
    aggregate(organizationId, startOfMonth()),
    aggregate(organizationId, null),
  ]);
  const month = fold(monthRows);
  const all = fold(allRows);

  const out = new Map<string, MemberUsage>();
  for (const id of new Set([...month.keys(), ...all.keys()])) {
    out.set(id, {
      thisMonth: month.get(id) ?? { ...EMPTY },
      sinceStart: all.get(id) ?? { ...EMPTY },
    });
  }
  return out;
}

/** Usage for a single member. */
export async function getMemberUsage(
  organizationId: string,
  membershipId: string
): Promise<MemberUsage> {
  const all = await getOrgUsage(organizationId);
  return all.get(membershipId) ?? { thisMonth: { ...EMPTY }, sinceStart: { ...EMPTY } };
}
