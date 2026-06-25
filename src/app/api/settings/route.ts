import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";

const updateSettingsSchema = z.object({
  notifyEmail: z.boolean().optional(),
  notifyWebhookUrl: z.string().nullable().optional(),
  notifySlackWebhookUrl: z.string().nullable().optional(),
  logRetentionDays: z.number().int().min(1).max(365).optional(),
  defaultSessionDurationHours: z.number().int().min(1).max(8760).optional(),
  allowedAuthProviders: z.array(z.enum(["EMAIL", "GOOGLE", "GITHUB"])).optional(),
  require2FA: z.boolean().optional(),
  aiFilterEnabled: z.boolean().optional(),
  aiModel: z.string().min(1).optional(),
  defaultLlmProviderId: z.string().nullable().optional(),
  approvalTimeoutSecs: z.number().int().min(30).max(3600).optional(),
  channelPersistMessageBodies: z.boolean().optional(),
  toolGatewayMode: z.enum(["off", "on"]).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const data = updateSettingsSchema.parse(body);

    if (data.defaultLlmProviderId) {
      const provider = await prisma.llmProvider.findFirst({
        where: { id: data.defaultLlmProviderId, organizationId: session.organizationId },
        select: { id: true },
      });
      if (!provider) {
        return NextResponse.json(
          { error: "LLM provider not found" },
          { status: 400 }
        );
      }
    }

    const settings = await prisma.orgSettings.update({
      where: { organizationId: session.organizationId },
      data,
    });

    return NextResponse.json(settings);
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
