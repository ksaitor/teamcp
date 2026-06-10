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

    // Need the existing channel to know its type (for credential validation /
    // delivery reconcile) and to scope the update to this org.
    const existing = await prisma.channel.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const updateData: any = { ...data };
    if (data.credentials !== undefined) {
      // A new, non-empty token must be valid before we save it — same guarantee
      // as channel creation. An invalid key never reaches the worker.
      if (data.credentials && existing.type !== "WEB") {
        const ok = await getChannelAdapter(existing.type).testConnection({
          type: existing.type,
          config: (data.config ?? existing.config) as any,
          credentialsEncrypted: encrypt(data.credentials),
        });
        if (!ok) {
          return NextResponse.json(
            { error: "Could not connect with these credentials. Double-check the token." },
            { status: 400 }
          );
        }
      }
      updateData.credentialsEncrypted = data.credentials
        ? encrypt(data.credentials)
        : null;
      delete updateData.credentials;
    }

    const channel = await prisma.channel.update({
      where: { id, organizationId: session.organizationId },
      data: updateData,
    });

    // Re-reconcile external delivery. When active, register delivery (a token
    // change re-registers Telegram's webhook, or clears it in polling mode);
    // when disabled, tear it down so the platform stops pushing. Best-effort.
    let deliveryWarning: string | undefined;
    const adapter = getChannelAdapter(channel.type);
    try {
      if (channel.status === "ACTIVE") {
        await adapter.configureDelivery?.(channel);
      } else {
        await adapter.teardownDelivery?.(channel);
      }
    } catch (err: any) {
      deliveryWarning = `Saved, but delivery setup failed: ${err.message}`;
      console.error("delivery reconcile failed", err);
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

    const channel = await prisma.channel.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Stop the external platform from pushing before we drop the row.
    if (channel.status === "ACTIVE") {
      try {
        await getChannelAdapter(channel.type).teardownDelivery?.(channel);
      } catch (err) {
        console.error("teardownDelivery failed", err);
      }
    }

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
