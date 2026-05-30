import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const MAX_IMAGE_BYTES = 1_500_000;

const updateMemberSchema = z.object({
  name: z.string().min(1).max(200).nullable().optional(),
  image: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) => v == null || (v.startsWith("data:image/") && v.length <= MAX_IMAGE_BYTES),
      "Profile picture must be a data URL under 1.5MB"
    ),
  jobTitle: z.string().max(200).nullable().optional(),
  responsibilities: z.string().nullable().optional(),
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

    // You can't change your own role.
    if (data.role !== undefined && id === session.membershipId) {
      return NextResponse.json(
        { error: "You can't change your own role." },
        { status: 400 }
      );
    }

    // Only OWNERs can assign the OWNER role
    if (data.role === "OWNER" && session.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only owners can promote to OWNER role" },
        { status: 403 }
      );
    }

    // Ownership transfer: promoting another member to OWNER demotes the
    // current owner to ADMIN, so there is always exactly one owner.
    const isOwnershipTransfer =
      data.role === "OWNER" && id !== session.membershipId;
    if (isOwnershipTransfer) {
      await prisma.orgMembership.update({
        where: { id: session.membershipId, organizationId: session.organizationId },
        data: { role: "ADMIN" },
      });
    }

    // Split user-owned fields off from membership-owned fields.
    const { name, image, suspend, ...membershipFields } = data;
    const updateData: any = { ...membershipFields };
    if (suspend === true) {
      updateData.suspendedAt = new Date();
      updateData.status = "SUSPENDED";
      // Invalidate all active MCP tokens
      await prisma.mcpToken.deleteMany({ where: { membershipId: id } });
    } else if (suspend === false) {
      updateData.suspendedAt = null;
      updateData.status = "ACTIVE";
    }

    // Look up userId once if we need to update the User row.
    if (name !== undefined || image !== undefined) {
      const existing = await prisma.orgMembership.findFirst({
        where: { id, organizationId: session.organizationId },
        select: { userId: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
      }
      const userData: { name?: string | null; image?: string | null } = {};
      if (name !== undefined) userData.name = name;
      if (image !== undefined) userData.image = image;
      await prisma.user.update({
        where: { id: existing.userId },
        data: userData,
      });
    }

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

    if (id === session.membershipId) {
      return NextResponse.json(
        { error: "You can't remove yourself from the organization." },
        { status: 400 }
      );
    }

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
