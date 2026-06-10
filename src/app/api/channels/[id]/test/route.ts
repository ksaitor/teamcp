import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getChannelAdapter } from "@/channels/registry";

/**
 * Validate a channel's stored credentials against the external platform
 * (e.g. Telegram getMe). Used by the "Test connection" button in the admin UI.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const channel = await prisma.channel.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const adapter = getChannelAdapter(channel.type);
    const ok = await adapter.testConnection(channel);
    return NextResponse.json({ ok });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
