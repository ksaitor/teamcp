import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { getChannelAdapter } from "@/channels/registry";

const updateChannelSchema = z.object({
  name: z.string().min(1).optional(),
  credentials: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  modelOverride: z.string().nullable().optional(),
  defaultLlmProviderId: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const channel = await prisma.channel.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        identities: {
          include: {
            membership: {
              include: { user: { select: { name: true, email: true } } },
            },
          },
        },
        _count: { select: { conversations: true } },
      },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const { credentialsEncrypted, ...safe } = channel;
    return NextResponse.json({
      ...safe,
      hasCredentials: !!credentialsEncrypted,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const data = updateChannelSchema.parse(body);

    const updateData: any = { ...data };
    if (data.credentials !== undefined) {
      updateData.credentialsEncrypted = data.credentials
        ? encrypt(data.credentials)
        : null;
      delete updateData.credentials;
    }

    const channel = await prisma.channel.update({
      where: { id, organizationId: session.organizationId },
      data: updateData,
    });

    // Re-reconcile external delivery (e.g. a deliveryMode or token change flips
    // Telegram between setWebhook and deleteWebhook). Best-effort.
    let deliveryWarning: string | undefined;
    const adapter = getChannelAdapter(channel.type);
    if (adapter.configureDelivery && channel.status === "ACTIVE") {
      try {
        await adapter.configureDelivery(channel);
      } catch (err: any) {
        deliveryWarning = `Saved, but delivery setup failed: ${err.message}`;
        console.error("configureDelivery failed", err);
      }
    }

    const { credentialsEncrypted, ...safe } = channel;
    return NextResponse.json({
      ...safe,
      hasCredentials: !!credentialsEncrypted,
      deliveryWarning,
    });
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    await prisma.channel.delete({
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
