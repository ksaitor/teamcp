import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const createMemberSchema = z.object({
  email: z.string().email(),
  permissionInstructions: z.string().optional(),
});

export async function GET() {
  try {
    const session = await requireAdmin();
    const memberships = await prisma.orgMembership.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        connectorAccess: { include: { connector: true } },
        _count: { select: { auditLogs: true } },
      },
    });
    return NextResponse.json(memberships);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const data = createMemberSchema.parse(body);

    // Find or create user by email
    let user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: data.email },
      });
    }

    const membership = await prisma.orgMembership.create({
      data: {
        userId: user.id,
        organizationId: session.organizationId,
        role: "MEMBER",
        status: "INVITED",
        permissionInstructions: data.permissionInstructions,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json(membership, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A member with this email already exists in this organization" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
