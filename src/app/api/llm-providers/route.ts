import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["OPENAI", "ANTHROPIC", "XAI", "KIMI", "OPENROUTER", "CUSTOM_OPENAI"]),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().min(1),
  config: z.record(z.any()).optional(),
});

export async function GET() {
  try {
    const session = await requireAdmin();
    const providers = await prisma.llmProvider.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
    });
    const settings = await prisma.orgSettings.findUnique({
      where: { organizationId: session.organizationId },
      select: { defaultLlmProviderId: true },
    });

    const safe = providers.map(({ apiKeyEncrypted, ...rest }) => ({
      ...rest,
      hasApiKey: !!apiKeyEncrypted,
      isDefault: settings?.defaultLlmProviderId === rest.id,
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
    const data = createSchema.parse(body);

    if (data.type === "CUSTOM_OPENAI" && !data.baseUrl) {
      return NextResponse.json(
        { error: "A base URL is required for custom endpoints" },
        { status: 400 }
      );
    }

    const provider = await prisma.llmProvider.create({
      data: {
        name: data.name,
        type: data.type,
        apiKeyEncrypted: data.apiKey ? encrypt(data.apiKey) : null,
        baseUrl: data.baseUrl || null,
        defaultModel: data.defaultModel,
        config: data.config || {},
        organizationId: session.organizationId,
      },
    });

    const { apiKeyEncrypted, ...safe } = provider;
    return NextResponse.json({ ...safe, hasApiKey: !!apiKeyEncrypted }, { status: 201 });
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
