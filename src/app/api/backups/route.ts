import { NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { extensions } from "@/extensions";

export async function GET() {
  try {
    const session = await requireAdmin();

    const [destination, runs] = await Promise.all([
      prisma.backupDestination.findUnique({
        where: { organizationId: session.organizationId },
      }),
      prisma.backupRun.findMany({
        where: { organizationId: session.organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const s3 = extensions.canUseS3Backups
      ? await extensions.canUseS3Backups(session.organizationId)
      : { allowed: true as const };

    const safeDestination = destination
      ? {
          id: destination.id,
          type: destination.type,
          config: destination.config,
          schedule: destination.schedule,
          retentionCount: destination.retentionCount,
          lastBackupAt: destination.lastBackupAt,
          status: destination.status,
          hasCredentials: Boolean(destination.credentialsEncrypted),
        }
      : null;

    return NextResponse.json({
      destination: safeDestination,
      runs,
      s3Allowed: s3.allowed,
      s3Reason: s3.allowed ? null : s3.reason,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
