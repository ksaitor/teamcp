import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { discoverAndStoreTools } from "@/connectors/external-mcp/discovery";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const connector = await prisma.connector.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const tools = await discoverAndStoreTools(id);
    return NextResponse.json({ count: tools.length });
  } catch (error: any) {
    if (error.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: `Discovery failed: ${error.message}` },
      { status: 502 }
    );
  }
}
