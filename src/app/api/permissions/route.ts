import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const upsertPermissionSchema = z.object({
  membershipId: z.string(),
  connectorId: z.string(),
  readAccess: z.boolean().optional(),
  writeAccess: z.boolean().optional(),
  paused: z.boolean().optional(),
  nativePermissions: z.record(z.string(), z.any()).nullable().optional(),
  customScript: z.string().nullable().optional(),
  aiInstructions: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const data = upsertPermissionSchema.parse(body);

    // Verify membership and connector belong to this org
    const [membership, connector] = await Promise.all([
      prisma.orgMembership.findFirst({
        where: { id: data.membershipId, organizationId: session.organizationId },
      }),
      prisma.connector.findFirst({
        where: { id: data.connectorId, organizationId: session.organizationId },
      }),
    ]);

    if (!membership) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const access = await prisma.memberConnectorAccess.upsert({
      where: {
        membershipId_connectorId: {
          membershipId: data.membershipId,
          connectorId: data.connectorId,
        },
      },
      create: {
        membershipId: data.membershipId,
        connectorId: data.connectorId,
        readAccess: data.readAccess ?? true,
        writeAccess: data.writeAccess ?? false,
        paused: data.paused ?? false,
        nativePermissions: data.nativePermissions ?? undefined,
        customScript: data.customScript ?? undefined,
        aiInstructions: data.aiInstructions ?? undefined,
      },
      update: {
        readAccess: data.readAccess,
        writeAccess: data.writeAccess,
        paused: data.paused,
        nativePermissions: data.nativePermissions ?? undefined,
        customScript: data.customScript,
        aiInstructions: data.aiInstructions,
      },
    });

    return NextResponse.json(access);
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

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const { searchParams } = new URL(req.url);
    const membershipId = searchParams.get("membershipId");
    const connectorId = searchParams.get("connectorId");

    if (!membershipId || !connectorId) {
      return NextResponse.json(
        { error: "membershipId and connectorId required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const membership = await prisma.orgMembership.findFirst({
      where: { id: membershipId, organizationId: session.organizationId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    await prisma.memberConnectorAccess.delete({
      where: { membershipId_connectorId: { membershipId, connectorId } },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
