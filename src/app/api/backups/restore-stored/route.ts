import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { decodeBackup } from "@/backup/archive";
import { restoreBundle } from "@/backup/restore";
import { fetchStoredBackup } from "@/backup/runner";

const schema = z.object({
  objectKey: z.string().min(1),
  passphrase: z.string().optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const { objectKey, passphrase, dryRun } = schema.parse(body);

    const file = await fetchStoredBackup(session.organizationId, objectKey);
    const bundle = decodeBackup(file, passphrase);
    const report = await restoreBundle(session.organizationId, bundle, {
      dryRun: Boolean(dryRun),
    });

    return NextResponse.json(report);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 400 }
    );
  }
}
