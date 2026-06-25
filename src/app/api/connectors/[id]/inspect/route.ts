import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { inspectPostgres } from "@/connectors/postgres/inspect";

/**
 * Live database introspection for a Postgres connector: connection status, the
 * role we connect as and its privileges, and the available schemas/tables.
 * Also reconciles the connector's stored status with what we just observed.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const connector = await prisma.connector.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }
    if (connector.type !== "POSTGRES") {
      return NextResponse.json(
        { error: "Inspection is only available for PostgreSQL connectors" },
        { status: 400 }
      );
    }

    const connectionString = decrypt(connector.credentialsEncrypted);
    const result = await inspectPostgres(connectionString);

    // Keep the stored status in step with reality, but never override a
    // deliberately DISABLED connector.
    if (connector.status !== "DISABLED") {
      const nextStatus = result.ok ? "ACTIVE" : "ERROR";
      if (nextStatus !== connector.status) {
        await prisma.connector.update({
          where: { id: connector.id },
          data: { status: nextStatus },
        });
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
