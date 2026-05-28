import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const patchSchema = z.object({
  membershipId: z.string().min(1),
  connectorToolId: z.string().min(1),
  allowed: z.boolean(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const membershipId = new URL(req.url).searchParams.get("membershipId");
    if (!membershipId) {
      return NextResponse.json({ error: "membershipId required" }, { status: 400 });
    }

    const connector = await prisma.connector.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        tools: {
          where: { enabled: true },
          orderBy: { toolName: "asc" },
          include: { memberAccess: { where: { membershipId } } },
        },
      },
    });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const tools = connector.tools.map((t) => ({
      id: t.id,
      toolName: t.toolName,
      description: t.description,
      // No override row means access is allowed by default.
      allowed: t.memberAccess[0]?.allowed ?? true,
    }));

    return NextResponse.json({ tools });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const { membershipId, connectorToolId, allowed } = patchSchema.parse(
      await req.json()
    );

    // Both the membership and the tool must belong to this org / connector.
    const [membership, tool] = await Promise.all([
      prisma.orgMembership.findFirst({
        where: { id: membershipId, organizationId: session.organizationId },
      }),
      prisma.connectorTool.findFirst({
        where: {
          id: connectorToolId,
          connectorId: id,
          connector: { organizationId: session.organizationId },
        },
      }),
    ]);
    if (!membership || !tool) {
      return NextResponse.json(
        { error: "Member or tool not found" },
        { status: 404 }
      );
    }

    await prisma.memberToolAccess.upsert({
      where: {
        membershipId_connectorToolId: { membershipId, connectorToolId },
      },
      create: { membershipId, connectorToolId, allowed },
      update: { allowed },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
