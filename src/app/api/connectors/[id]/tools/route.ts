import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const patchSchema = z.object({ enabled: z.boolean() });

/**
 * Bulk enable/disable every tool on a connector. Used by the "Enable all" /
 * "Disable all" actions in the connector tool list. Since new tools are
 * discovered disabled by default, this gives the owner a one-click way to opt a
 * whole connector in or out.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const { enabled } = patchSchema.parse(await req.json());

    // Verify the connector belongs to this org.
    const connector = await prisma.connector.findFirst({
      where: { id, organizationId: session.organizationId },
      select: { id: true },
    });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const result = await prisma.connectorTool.updateMany({
      where: { connectorId: id },
      data: { enabled },
    });

    return NextResponse.json({ ok: true, count: result.count });
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
