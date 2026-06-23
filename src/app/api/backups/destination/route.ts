import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";
import { extensions } from "@/extensions";
import { testDestination } from "@/backup/s3";

const schema = z.object({
  bucket: z.string().min(1),
  region: z.string().optional(),
  endpoint: z.string().url().optional().or(z.literal("")),
  prefix: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
  accessKeyId: z.string().min(1),
  // Optional on update: omit to keep the stored secret.
  secretAccessKey: z.string().optional(),
  schedule: z.enum(["OFF", "DAILY", "WEEKLY"]).optional(),
  retentionCount: z.number().int().min(1).max(365).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAdmin();

    if (extensions.canUseS3Backups) {
      const decision = await extensions.canUseS3Backups(session.organizationId);
      if (!decision.allowed) {
        return NextResponse.json({ error: decision.reason }, { status: 402 });
      }
    }

    const body = await req.json();
    const data = schema.parse(body);

    const existing = await prisma.backupDestination.findUnique({
      where: { organizationId: session.organizationId },
    });

    // Resolve the secret: use the new one if given, else reuse the stored one.
    let secretAccessKey = data.secretAccessKey;
    if (!secretAccessKey && existing) {
      const stored = JSON.parse(decrypt(existing.credentialsEncrypted));
      secretAccessKey = stored.secretAccessKey;
    }
    if (!secretAccessKey) {
      return NextResponse.json(
        { error: "Secret access key is required." },
        { status: 400 }
      );
    }

    const config = {
      bucket: data.bucket,
      region: data.region || undefined,
      endpoint: data.endpoint || undefined,
      prefix: data.prefix || undefined,
      forcePathStyle: data.forcePathStyle ?? Boolean(data.endpoint),
    };
    const creds = { accessKeyId: data.accessKeyId, secretAccessKey };

    // Fail fast on bad credentials/bucket rather than silently storing them.
    try {
      await testDestination(config, creds);
    } catch (err: any) {
      return NextResponse.json(
        { error: `Could not reach the bucket: ${err.message}` },
        { status: 400 }
      );
    }

    const credentialsEncrypted = encrypt(JSON.stringify(creds));
    const destination = await prisma.backupDestination.upsert({
      where: { organizationId: session.organizationId },
      update: {
        config,
        credentialsEncrypted,
        schedule: data.schedule,
        retentionCount: data.retentionCount,
        status: "ACTIVE",
      },
      create: {
        organizationId: session.organizationId,
        config,
        credentialsEncrypted,
        schedule: data.schedule ?? "OFF",
        retentionCount: data.retentionCount ?? 7,
      },
    });

    return NextResponse.json({ id: destination.id, status: destination.status });
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
    const session = await requireAdmin();
    await prisma.backupDestination.deleteMany({
      where: { organizationId: session.organizationId },
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
