import type { Channel } from "@prisma/client";
import { prisma } from "@/db";
import { sha256 } from "@/lib/crypto";
import { runAgentTurn, runAgentTurnStream } from "@/agent/run";
import type { AuthenticatedMember } from "@/server/auth";
import { getChannelAdapter } from "./registry";
import type { InboundMessage } from "./interface";

/**
 * Channel-agnostic inbound pipeline shared by the webhook route and the
 * per-channel polling runners: resolve identity (consuming a link code if the
 * sender is unlinked), verify the member is active, get-or-create the
 * conversation, run one agent turn, and send the reply back through the
 * channel's adapter.
 *
 * The caller is responsible for parsing the raw payload into an InboundMessage
 * (webhook route via `adapter.handleInbound`, runners via the adapter's parser).
 */
export async function processInboundMessage(
  channel: Channel,
  inbound: InboundMessage
): Promise<void> {
  const adapter = getChannelAdapter(channel.type);

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
    identity = await tryConsumeLinkCode(
      channel.id,
      inbound.text,
      inbound.externalId,
      inbound.displayName
    );
    if (identity) {
      await adapter.sendReply(channel, inbound.threadRef, "Linked. You can chat now.");
      return;
    }
    await adapter.sendReply(
      channel,
      inbound.threadRef,
      "This account is not linked. Generate a link code in the TeamCP admin and send it here."
    );
    return;
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
    return;
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

  // Prefer streaming when the channel supports it (Telegram): show a typing
  // indicator and stream partial output straight from the agent, then commit
  // the final message. Otherwise fall back to a single completed reply.
  if (adapter.beginReplyStream) {
    const stream = await adapter.beginReplyStream(channel, inbound.threadRef);
    try {
      const result = await runAgentTurnStream(
        { member, channel, conversation, userMessage: inbound.text },
        (event) => stream.onEvent(event)
      );
      await stream.finish(result.assistantText);
    } catch (err) {
      // Commit a clear reply (and tear down the live draft) before bubbling up,
      // so the user isn't left watching a frozen "typing…" indicator.
      await stream
        .finish("Sorry — something went wrong handling your message.")
        .catch(() => {});
      throw err;
    }
    return;
  }

  const result = await runAgentTurn({
    member,
    channel,
    conversation,
    userMessage: inbound.text,
  });

  await adapter.sendReply(channel, inbound.threadRef, result.assistantText);
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
