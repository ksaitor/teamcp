import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

const updateConnectorSchema = z.object({
  name: z.string().min(1).optional(),
  credentials: z.string().min(1).optional(),
  config: z.record(z.string(), z.any()).optional(),
  skipAiFilter: z.boolean().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const connector = await prisma.connector.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        tools: true,
        memberAccess: {
          include: {
            membership: {
              include: { user: { select: { name: true, email: true } } },
            },
          },
        },
      },
    });

    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const { credentialsEncrypted, ...safe } = connector;
    return NextResponse.json({ ...safe, hasCredentials: true });
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
    const data = updateConnectorSchema.parse(body);

    const updateData: any = { ...data };
    if (data.credentials) {
      updateData.credentialsEncrypted = encrypt(data.credentials);
      delete updateData.credentials;
    }

    const connector = await prisma.connector.update({
      where: { id, organizationId: session.organizationId },
      data: updateData,
    });

    const { credentialsEncrypted, ...safe } = connector;
    return NextResponse.json({ ...safe, hasCredentials: true });
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

    await prisma.connector.delete({
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
