import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const channel = await prisma.channel.findFirst({
      where: { id, organizationId: session.organizationId },
      select: { id: true },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const conversations = await prisma.conversation.findMany({
      where: { channelId: channel.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        membership: {
          include: { user: { select: { name: true, email: true } } },
        },
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json(conversations);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
