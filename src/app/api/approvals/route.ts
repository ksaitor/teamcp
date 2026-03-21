import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const actionSchema = z.object({
  approvalId: z.string(),
  status: z.enum(["APPROVED", "DENIED"]),
  adminResponse: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const data = actionSchema.parse(body);

    const approval = await prisma.approvalRequest.update({
      where: {
        id: data.approvalId,
        organizationId: session.organizationId,
      },
      data: {
        status: data.status,
        adminResponse: data.adminResponse,
        respondedAt: new Date(),
      },
    });

    return NextResponse.json(approval);
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
