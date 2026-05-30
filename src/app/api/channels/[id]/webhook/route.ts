import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { sha256 } from "@/lib/crypto";
import { getChannelAdapter } from "@/channels/registry";
import { runAgentTurn } from "@/agent/run";
import type { AuthenticatedMember } from "@/server/auth";

/**
 * Generic webhook receiver. Looks up the channel, hands the raw request to the
 * adapter, then either consumes a link code or runs an agent turn.
 *
 * Each org owns its own bot, so the adapter verifies the signature using
 * credentials stored on the channel row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel || channel.status !== "ACTIVE") {
      return NextResponse.json({ ok: true }); // don't leak existence
    }

    const adapter = getChannelAdapter(channel.type);
    const inbound = await adapter.handleInbound(req, channel);
    if (!inbound) return NextResponse.json({ ok: true });

    // 1. Look up an existing identity.
    let identity = await prisma.channelIdentity.findUnique({
      where: {
        channelId_externalId: {
          channelId: channel.id,
          externalId: inbound.externalId,
        },
      },
    });

    // 2. Unlinked? Try consuming a link code.
    if (!identity) {
      identity = await tryConsumeLinkCode(channel.id, inbound.text, inbound.externalId, inbound.displayName);
      if (identity) {
        await adapter.sendReply(channel, inbound.threadRef, "Linked. You can chat now.");
        return NextResponse.json({ ok: true });
      }
      await adapter.sendReply(
        channel,
        inbound.threadRef,
        "This account is not linked. Generate a link code in the TeamRouter admin and send it here."
      );
      return NextResponse.json({ ok: true });
    }

    const membership = await prisma.orgMembership.findUnique({
      where: { id: identity.membershipId },
      include: {
        user: { select: { name: true, email: true } },
        organization: { select: { slug: true } },
      },
    });
    if (!membership || membership.status !== "ACTIVE" || membership.suspendedAt) {
      await adapter.sendReply(
        channel,
        inbound.threadRef,
        "Your account is not active. Contact your administrator."
      );
      return NextResponse.json({ ok: true });
    }

    const member: AuthenticatedMember = {
      id: membership.id,
      userId: membership.userId,
      name: membership.user.name || "",
      email: membership.user.email,
      organizationId: membership.organizationId,
      orgSlug: membership.organization.slug,
      status: membership.status,
      suspendedAt: membership.suspendedAt,
      permissionInstructions: membership.permissionInstructions,
      responsibilities: membership.responsibilities,
      jobTitle: membership.jobTitle,
    };

    const conversation = await getOrCreateConversation({
      channelId: channel.id,
      channelIdentityId: identity.id,
      membershipId: membership.id,
      externalThreadId: inbound.externalThreadId,
    });

    const result = await runAgentTurn({
      member,
      channel,
      conversation,
      userMessage: inbound.text,
    });

    await adapter.sendReply(channel, inbound.threadRef, result.assistantText);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("channel webhook error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function tryConsumeLinkCode(
  channelId: string,
  text: string,
  externalId: string,
  displayName?: string
) {
  const code = text.trim().toUpperCase();
  if (code.length < 8) return null;

  const record = await prisma.channelLinkCode.findUnique({
    where: { codeHash: sha256(code) },
  });
  if (!record) return null;
  if (record.channelId !== channelId) return null;
  if (record.consumedAt) return null;
  if (record.expiresAt < new Date()) return null;

  const [identity] = await prisma.$transaction([
    prisma.channelIdentity.create({
      data: {
        channelId,
        membershipId: record.membershipId,
        externalId,
        displayName: displayName ?? null,
      },
    }),
    prisma.channelLinkCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
  ]);
  return identity;
}

async function getOrCreateConversation(input: {
  channelId: string;
  channelIdentityId: string;
  membershipId: string;
  externalThreadId?: string;
}) {
  if (input.externalThreadId) {
    const existing = await prisma.conversation.findFirst({
      where: {
        channelId: input.channelId,
        externalThreadId: input.externalThreadId,
      },
    });
    if (existing) return existing;
  }
  return prisma.conversation.create({
    data: {
      channelId: input.channelId,
      channelIdentityId: input.channelIdentityId,
      membershipId: input.membershipId,
      externalThreadId: input.externalThreadId ?? null,
    },
  });
}
