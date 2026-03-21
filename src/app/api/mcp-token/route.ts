import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireSession } from "@/lib/auth";
import { generateToken } from "@/lib/crypto";

/**
 * POST /api/mcp-token — Generate an MCP access token for the current membership.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    const membership = await prisma.orgMembership.findUnique({
      where: { id: session.membershipId },
      include: {
        organization: { select: { settings: true } },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    if (membership.status !== "ACTIVE") {
      return NextResponse.json({ error: "Membership is not active" }, { status: 403 });
    }

    if (membership.suspendedAt) {
      return NextResponse.json({ error: "Membership is suspended" }, { status: 403 });
    }

    const durationHours =
      membership.sessionDurationHours ??
      membership.organization.settings?.defaultSessionDurationHours ??
      720;

    const token = await prisma.mcpToken.create({
      data: {
        membershipId: membership.id,
        accessToken: generateToken(),
        expiresAt: new Date(Date.now() + durationHours * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}

/**
 * DELETE /api/mcp-token — Revoke an MCP token.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const tokenId = searchParams.get("id");

    if (!tokenId) {
      return NextResponse.json({ error: "Token ID required" }, { status: 400 });
    }

    await prisma.mcpToken.delete({
      where: {
        id: tokenId,
        membership: { id: session.membershipId },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
