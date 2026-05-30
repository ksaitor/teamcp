import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireSession } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";

const CODE_TTL_MS = 15 * 60 * 1000;

function generateLinkCode(): string {
  // 8-char alphanumeric, easy to type into a chat.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const channel = await prisma.channel.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    if (channel.type === "WEB") {
      return NextResponse.json(
        { error: "Web channel does not require linking" },
        { status: 400 }
      );
    }

    const code = generateLinkCode();
    await prisma.channelLinkCode.create({
      data: {
        channelId: channel.id,
        membershipId: session.membershipId,
        codeHash: sha256(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    return NextResponse.json({ code, expiresInSecs: CODE_TTL_MS / 1000 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
