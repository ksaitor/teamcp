import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const bodySchema = z.object({ tenantId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const { tenantId } = bodySchema.parse(await req.json());

    const connector = await prisma.connector.findFirst({
      where: { id, organizationId: session.organizationId, type: "XERO" },
      include: { oauth: true },
    });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const discovery = (connector.oauth?.discoveryState ?? {}) as {
      xeroOrgs?: { tenantId: string; tenantName: string }[];
    };
    const org = discovery.xeroOrgs?.find((o) => o.tenantId === tenantId);
    if (!org) {
      return NextResponse.json(
        { error: "Organisation not found in the authorized list" },
        { status: 400 }
      );
    }

    const existingConfig = (connector.config ?? {}) as Record<string, any>;
    await prisma.connector.update({
      where: { id },
      data: {
        status: "ACTIVE",
        config: {
          ...existingConfig,
          tenantId: org.tenantId,
          tenantName: org.tenantName,
        },
      },
    });
    await prisma.connectorOAuth.update({
      where: { connectorId: id },
      data: { discoveryState: undefined },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || "Could not select organisation" },
      { status: error.statusCode || 500 }
    );
  }
}
