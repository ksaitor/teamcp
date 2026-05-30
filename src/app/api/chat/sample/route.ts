import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { runAgentTurnEphemeralStream, type AgentEvent } from "@/agent/run";
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
  let session;
  let parsed;
  try {
    session = await requireAdmin();
    const body = await req.json();
    parsed = sampleSchema.parse(body);
  } catch (error: any) {
    const message =
      error instanceof z.ZodError ? "Invalid request" : error.message;
    return new Response(JSON.stringify({ error: message }), {
      status: error?.statusCode || 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { channelId, actAsMembershipId, text, history } = parsed;

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
    return new Response(JSON.stringify({ error: "Member not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (target.role !== "MEMBER") {
    return new Response(
      JSON.stringify({ error: "Only standard members can be sampled" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
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

  return streamAgentTurn((onEvent) =>
    runAgentTurnEphemeralStream(
      { member, channel, history, userMessage: text },
      onEvent
    )
  );
}

function streamAgentTurn(
  run: (
    onEvent: (e: AgentEvent) => void
  ) => Promise<{ assistantText: string; toolCalls: number; conversationId?: string }>
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        const result = await run(send);
        send({
          type: "done",
          assistantText: result.assistantText,
          toolCalls: result.toolCalls,
          conversationId: result.conversationId,
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
