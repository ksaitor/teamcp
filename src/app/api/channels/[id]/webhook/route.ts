import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { getChannelAdapter } from "@/channels/registry";
import { processInboundMessage } from "@/channels/process";

/**
 * Generic webhook receiver. Looks up the channel, hands the raw request to the
 * adapter for signature verification + parsing, then runs the shared inbound
 * pipeline (identity linking + agent turn). The same pipeline backs the
 * per-channel polling runners.
 *
 * Each org owns its own bot, so the adapter verifies the signature using
 * credentials stored on the channel row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel || channel.status !== "ACTIVE") {
      return NextResponse.json({ ok: true }); // don't leak existence
    }

    const adapter = getChannelAdapter(channel.type);

    // Platform handshakes that must echo a value in the response body (e.g.
    // Slack's url_verification challenge). Pass a clone so handleInbound can
    // still read the body.
    if (adapter.handleWebhookHandshake) {
      const handshake = await adapter.handleWebhookHandshake(req.clone(), channel);
      if (handshake) return handshake;
    }

    // Slack retries deliveries it thinks failed. We process inline and an agent
    // turn can outlast Slack's 3s ack window, so drop retries to avoid duplicate
    // replies. Harmless for other channels (header absent).
    if (req.headers.get("x-slack-retry-num")) {
      return NextResponse.json({ ok: true });
    }

    const inbound = await adapter.handleInbound(req, channel);
    if (!inbound) return NextResponse.json({ ok: true });

    await processInboundMessage(channel, inbound);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("channel webhook error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
