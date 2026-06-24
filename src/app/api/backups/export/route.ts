import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { buildConfigBundle } from "@/backup/bundle";
import { encodeBackup } from "@/backup/archive";

const schema = z.object({
  // When provided, the whole backup is sealed under this passphrase and is
  // portable to an instance with a different ENCRYPTION_KEY.
  passphrase: z.string().min(8).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const { passphrase } = schema.parse(body);

    const bundle = await buildConfigBundle(session.organizationId, {
      plaintextSecrets: Boolean(passphrase),
    });
    const { data } = encodeBackup(bundle, passphrase);

    const filename = `teamcp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
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
