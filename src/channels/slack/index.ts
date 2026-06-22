import type { Channel } from "@prisma/client";
import type { ChannelAdapter, ChannelRunner, InboundMessage } from "../interface";
import {
  authTest,
  eventToInbound,
  getCredentials,
  postMessage,
  verifySlackSignature,
  type SlackEventEnvelope,
} from "./api";
import { SlackSocketRunner } from "./socket";

export type SlackDeliveryMode = "socket" | "webhook";

/**
 * Global Slack delivery mode — an internal, code-level switch (NOT a per-channel
 * or end-user setting). Flip this constant to change how every Slack app in this
 * deployment receives events:
 *
 *   "socket"   — in-process Socket Mode runner inside the unified server
 *                (server.ts). No public URL needed. Use on stateful Node/Bun
 *                hosts. Requires an app-level token (xapp-…) in the credentials.
 *   "webhook"  — Slack pushes Events API requests to our /webhook route. The
 *                org pastes the Request URL into their Slack app's Event
 *                Subscriptions; we verify each request with the signing secret.
 *                Use on serverless deploys (e.g. Vercel).
 *
 * Mirrors TELEGRAM_DELIVERY_MODE. Promote to an env var here if it ever needs
 * to vary per deployment, without touching call sites.
 */
export const SLACK_DELIVERY_MODE: SlackDeliveryMode = "socket";

export class SlackChannelAdapter implements ChannelAdapter {
  readonly type = "SLACK" as const;

  /**
   * Events API url_verification handshake: Slack POSTs a one-time challenge when
   * the Request URL is (re)configured and expects it echoed back in the body.
   * The standard InboundMessage pipeline can't express that, so we own the
   * response here. Returns null for anything that isn't a verification request.
   */
  async handleWebhookHandshake(req: Request, channel: Channel): Promise<Response | null> {
    const raw = await req.text();
    let body: SlackEventEnvelope | null = null;
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
    if (body?.type !== "url_verification") return null;

    // Verify the signature before honoring the challenge so a stranger can't
    // point their app at our URL and confirm a channel exists.
    const { signingSecret } = getCredentials(channel);
    const ok =
      !!signingSecret &&
      verifySlackSignature({
        signingSecret,
        timestamp: req.headers.get("x-slack-request-timestamp"),
        signature: req.headers.get("x-slack-signature"),
        rawBody: raw,
      });
    if (!ok) return new Response("invalid signature", { status: 401 });

    return new Response(body.challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  async handleInbound(req: Request, channel: Channel): Promise<InboundMessage | null> {
    const raw = await req.text();
    const { signingSecret } = getCredentials(channel);
    if (!signingSecret) return null;

    const ok = verifySlackSignature({
      signingSecret,
      timestamp: req.headers.get("x-slack-request-timestamp"),
      signature: req.headers.get("x-slack-signature"),
      rawBody: raw,
    });
    if (!ok) return null;

    let body: SlackEventEnvelope | null = null;
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!body || body.type !== "event_callback") return null;
    return eventToInbound(body.event);
  }

  async sendReply(
    channel: Channel,
    threadRef: Record<string, any>,
    text: string
  ): Promise<void> {
    const { botToken } = getCredentials(channel);
    await postMessage(botToken, threadRef.channel, text, threadRef.threadTs);
  }

  async testConnection(
    channel: Pick<Channel, "type" | "config" | "credentialsEncrypted">
  ): Promise<boolean> {
    try {
      const creds = getCredentials(channel);
      await authTest(creds.botToken);
      // Reject up front if the secret required by the active delivery mode is
      // missing, so the org never saves a channel that can't actually receive.
      if (SLACK_DELIVERY_MODE === "socket" && !creds.appToken) return false;
      if (SLACK_DELIVERY_MODE === "webhook" && !creds.signingSecret) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * In Socket Mode, the supervisor runs one WebSocket loop per channel. In
   * webhook mode there's nothing to run (Slack pushes to /webhook), so return
   * null and keep the mode decision local to this adapter.
   */
  createRunner(channel: Channel): ChannelRunner | null {
    if (SLACK_DELIVERY_MODE !== "socket") return null;
    return new SlackSocketRunner(channel);
  }
}
