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

const patchSchema = z.object({
  suspended: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireOwner();
    const body = await req.json();
    const { suspended } = patchSchema.parse(body);

    const org = await prisma.organization.update({
      where: { id: session.organizationId },
      data: { suspendedAt: suspended ? new Date() : null },
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
