import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireSession } from "@/lib/auth";
import { AuthError } from "@/lib/errors";

async function requireOwner() {
  const session = await requireSession();
  if (session.role !== "OWNER") {
    throw new AuthError("Owner access required");
  }
  return session;
}

// A ~256px square JPEG data URI is well under 50KB; cap generously to stop
// abuse without rejecting legitimate uploads.
const MAX_LOGO_LENGTH = 256 * 1024;

const patchSchema = z.object({
  suspended: z.boolean().optional(),
  logoUrl: z.string().max(MAX_LOGO_LENGTH).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = patchSchema.parse(body);

    const data: { suspendedAt?: Date | null; logoUrl?: string | null } = {};

    // Suspending the org is an owner-only action; logo branding is admin-level.
    if (parsed.suspended !== undefined) {
      if (session.role !== "OWNER") throw new AuthError("Owner access required");
      data.suspendedAt = parsed.suspended ? new Date() : null;
    }
    if (parsed.logoUrl !== undefined) {
      if (session.role !== "OWNER" && session.role !== "ADMIN") {
        throw new AuthError("Admin access required");
      }
      data.logoUrl = parsed.logoUrl;
    }

    const org = await prisma.organization.update({
      where: { id: session.organizationId },
      data,
    });
    return NextResponse.json(org);
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

export async function DELETE() {
  try {
    const session = await requireOwner();
    await prisma.organization.delete({
      where: { id: session.organizationId },
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
