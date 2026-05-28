import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { probeServer } from "@/connectors/external-mcp/discovery";

const probeSchema = z.object({
  serverUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { serverUrl } = probeSchema.parse(await req.json());

    const result = await probeServer(serverUrl);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    if (error.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: `Could not reach MCP server: ${error.message}` },
      { status: 502 }
    );
  }
}
