import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { runAgentTurnEphemeral } from "@/agent/run";
import type { AuthenticatedMember } from "@/server/auth";

const sampleSchema = z.object({
  channelId: z.string(),
  actAsMembershipId: z.string(),
  text: z.string().min(1).max(8000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(100)
    .default([]),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const { channelId, actAsMembershipId, text, history } = sampleSchema.parse(body);

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

    const target = await prisma.orgMembership.findFirst({
      where: {
        id: actAsMembershipId,
        organizationId: session.organizationId,
      },
      include: {
        user: { select: { name: true, email: true } },
        organization: { select: { slug: true } },
      },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    // No one can sample owners or admins — only rank-below members.
    if (target.role !== "MEMBER") {
      return NextResponse.json(
        { error: "Only standard members can be sampled" },
        { status: 403 }
      );
    }

    const member: AuthenticatedMember = {
      id: target.id,
      userId: target.userId,
      name: target.user.name || "",
      email: target.user.email,
      organizationId: target.organizationId,
      orgSlug: target.organization.slug,
      status: target.status,
      suspendedAt: target.suspendedAt,
      permissionInstructions: target.permissionInstructions,
      responsibilities: target.responsibilities,
      jobTitle: target.jobTitle,
    };

    const result = await runAgentTurnEphemeral({
      member,
      channel,
      history,
      userMessage: text,
    });

    return NextResponse.json({
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
