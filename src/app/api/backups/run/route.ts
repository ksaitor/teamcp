import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { extensions } from "@/extensions";
import { runS3Backup } from "@/backup/runner";

export async function POST() {
  try {
    const session = await requireAdmin();

    if (extensions.canUseS3Backups) {
      const decision = await extensions.canUseS3Backups(session.organizationId);
      if (!decision.allowed) {
        return NextResponse.json({ error: decision.reason }, { status: 402 });
      }
    }

    const result = await runS3Backup(session.organizationId, "MANUAL");
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, objectKey: result.objectKey });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
