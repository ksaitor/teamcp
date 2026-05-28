import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id, toolId } = await params;
    const { enabled } = patchSchema.parse(await req.json());

    // Verify the tool belongs to a connector in this org.
    const tool = await prisma.connectorTool.findFirst({
      where: { id: toolId, connectorId: id, connector: { organizationId: session.organizationId } },
    });
    if (!tool) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    await prisma.connectorTool.update({
      where: { id: toolId },
      data: { enabled },
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
