import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getLlmClient } from "@/ai/providers";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const provider = await prisma.llmProvider.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    let ok = false;
    let message: string | undefined;
    try {
      ok = await getLlmClient(provider).testConnection();
    } catch (err: any) {
      ok = false;
      message = err.message;
    }

    await prisma.llmProvider.update({
      where: { id, organizationId: session.organizationId },
      data: { status: ok ? "ACTIVE" : "ERROR" },
    });

    return NextResponse.json({ ok, message });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
