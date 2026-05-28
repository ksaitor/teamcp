import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

const createConnectorSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["POSTGRES", "MONGODB", "STRIPE", "EXTERNAL_MCP", "CUSTOM"]),
  credentials: z.string().min(1),
  config: z.record(z.any()).optional(),
  skipAiFilter: z.boolean().optional(),
  status: z.enum(["ACTIVE", "PENDING"]).optional(),
});

export async function GET() {
  try {
    const session = await requireAdmin();
    const connectors = await prisma.connector.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { memberAccess: true, tools: true } },
      },
    });

    const safe = connectors.map(({ credentialsEncrypted, ...rest }) => ({
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
    const data = createConnectorSchema.parse(body);

    const connector = await prisma.connector.create({
      data: {
        name: data.name,
        type: data.type,
        credentialsEncrypted: encrypt(data.credentials),
        config: data.config || {},
        skipAiFilter: data.skipAiFilter || false,
        status: data.status || "ACTIVE",
        organizationId: session.organizationId,
      },
    });

    const { credentialsEncrypted, ...safe } = connector;
    return NextResponse.json({ ...safe, hasCredentials: true }, { status: 201 });
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
