import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireSession } from "@/lib/auth";
import { runAgentTurnStream, type AgentEvent } from "@/agent/run";
import type { AuthenticatedMember } from "@/server/auth";

const sendMessageSchema = z.object({
  text: z.string().min(1).max(8000),
  conversationId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  let session;
  let parsed;
  let channelId: string;
  try {
    session = await requireSession();
    ({ channelId } = await params);
    const body = await req.json();
    parsed = sendMessageSchema.parse(body);
  } catch (error: any) {
    const message =
      error instanceof z.ZodError ? "Invalid request" : error.message;
    return new Response(JSON.stringify({ error: message }), {
      status: error?.statusCode || 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { text, conversationId } = parsed;

  const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      organizationId: session.organizationId,
      type: "WEB",
      status: "ACTIVE",
    },
  });
  if (!channel) {
    return new Response(JSON.stringify({ error: "Web channel not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const externalId = `user:${session.userId}`;
  const identity = await prisma.channelIdentity.upsert({
    where: {
      channelId_externalId: { channelId: channel.id, externalId },
    },
    create: {
      channelId: channel.id,
      membershipId: session.membershipId,
      externalId,
    },
    update: {},
  });

  let conversation = conversationId
    ? await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          channelId: channel.id,
          membershipId: session.membershipId,
        },
      })
    : null;

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        channelId: channel.id,
        channelIdentityId: identity.id,
        membershipId: session.membershipId,
        title: text.slice(0, 60),
      },
    });
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { id: session.membershipId },
    include: {
      user: { select: { name: true, email: true } },
      organization: { select: { slug: true } },
    },
  });
  if (!membership) {
    return new Response(JSON.stringify({ error: "Membership not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
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

  const encoder = new TextEncoder();
  const conversationIdForClient = conversation.id;
  const conv = conversation;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        const result = await runAgentTurnStream(
          { member, channel, conversation: conv, userMessage: text },
          send
        );
        send({
          type: "done",
          assistantText: result.assistantText,
          toolCalls: result.toolCalls,
          conversationId: conversationIdForClient,
        });
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", error: err?.message || "Run failed" }) + "\n"
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
