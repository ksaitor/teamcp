import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().min(1).optional(),
  config: z.record(z.any()).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const data = updateSchema.parse(body);

    const updateData: any = { ...data };
    if (data.apiKey) {
      updateData.apiKeyEncrypted = encrypt(data.apiKey);
      delete updateData.apiKey;
    }

    const provider = await prisma.llmProvider.update({
      where: { id, organizationId: session.organizationId },
      data: updateData,
    });

    const { apiKeyEncrypted, ...safe } = provider;
    return NextResponse.json({ ...safe, hasApiKey: !!apiKeyEncrypted });
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    // Clear the org default if it pointed at this provider.
    await prisma.orgSettings.updateMany({
      where: { organizationId: session.organizationId, defaultLlmProviderId: id },
      data: { defaultLlmProviderId: null },
    });

    await prisma.llmProvider.delete({
      where: { id, organizationId: session.organizationId },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
