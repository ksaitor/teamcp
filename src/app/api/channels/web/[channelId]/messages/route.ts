import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireSession } from "@/lib/auth";
import { runAgentTurn } from "@/agent/run";
import type { AuthenticatedMember } from "@/server/auth";

const sendMessageSchema = z.object({
  text: z.string().min(1).max(8000),
  conversationId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const session = await requireSession();
    const { channelId } = await params;
    const body = await req.json();
    const { text, conversationId } = sendMessageSchema.parse(body);

    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        organizationId: session.organizationId,
        type: "WEB",
        status: "ACTIVE",
      },
    });
    if (!channel) {
      return NextResponse.json({ error: "Web channel not found" }, { status: 404 });
    }

    // Lazy-create the per-member WEB identity (keyed on userId).
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
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
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

    const result = await runAgentTurn({
      member,
      channel,
      conversation,
      userMessage: text,
    });

    return NextResponse.json({
      conversationId: conversation.id,
      assistantText: result.assistantText,
      toolCalls: result.toolCalls,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
