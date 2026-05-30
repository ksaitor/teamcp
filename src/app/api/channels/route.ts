import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { encrypt, generateToken } from "@/lib/crypto";

const createChannelSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["WEB", "TELEGRAM", "WHATSAPP", "SLACK"]),
  credentials: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
  modelOverride: z.string().optional(),
  defaultLlmProviderId: z.string().optional(),
});

export async function GET() {
  try {
    const session = await requireAdmin();
    const channels = await prisma.channel.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { identities: true, conversations: true } },
      },
    });

    const safe = channels.map(({ credentialsEncrypted, ...rest }) => ({
      ...rest,
      hasCredentials: !!credentialsEncrypted,
    }));
    return NextResponse.json(safe);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const data = createChannelSchema.parse(body);

    if (data.type !== "WEB" && !data.credentials) {
      return NextResponse.json(
        { error: "credentials are required for this channel type" },
        { status: 400 }
      );
    }

    const channel = await prisma.channel.create({
      data: {
        organizationId: session.organizationId,
        name: data.name,
        type: data.type,
        credentialsEncrypted: data.credentials ? encrypt(data.credentials) : null,
        config: data.config || {},
        webhookSecret: generateToken(),
        modelOverride: data.modelOverride || null,
        defaultLlmProviderId: data.defaultLlmProviderId || null,
      },
    });

    const { credentialsEncrypted, ...safe } = channel;
    return NextResponse.json(
      { ...safe, hasCredentials: !!credentialsEncrypted },
      { status: 201 }
    );
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
