import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const updateMemberSchema = z.object({
  permissionInstructions: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "INVITED", "SUSPENDED", "REVOKED"]).optional(),
  sessionDurationHours: z.number().nullable().optional(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional(),
  suspend: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const membership = await prisma.orgMembership.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        connectorAccess: { include: { connector: true } },
        toolAccess: { include: { connectorTool: true } },
        mcpTokens: { select: { id: true, expiresAt: true, lastUsedAt: true, createdAt: true } },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json(membership);
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
    const body = await req.json();
    const data = updateMemberSchema.parse(body);

    // Only OWNERs can assign the OWNER role
    if (data.role === "OWNER" && session.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only owners can promote to OWNER role" },
        { status: 403 }
      );
    }

    const updateData: any = { ...data };
    if (data.suspend === true) {
      updateData.suspendedAt = new Date();
      updateData.status = "SUSPENDED";
      // Invalidate all active MCP tokens
      await prisma.mcpToken.deleteMany({ where: { membershipId: id } });
    } else if (data.suspend === false) {
      updateData.suspendedAt = null;
      updateData.status = "ACTIVE";
    }
    delete updateData.suspend;

    const membership = await prisma.orgMembership.update({
      where: { id, organizationId: session.organizationId },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json(membership);
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    await prisma.orgMembership.delete({
      where: { id, organizationId: session.organizationId },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
