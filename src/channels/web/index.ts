import type { Channel } from "@prisma/client";
import type { ChannelAdapter, InboundMessage } from "../interface";

/**
 * The web channel is a special case: messages arrive at a NextAuth-gated route
 * inside the admin app, not via a third-party webhook. The route resolves the
 * caller from the session and calls runAgentTurn directly. handleInbound /
 * sendReply on this adapter are therefore unused, but we keep the shape
 * uniform so the registry stays homogeneous.
 */
export class WebChannelAdapter implements ChannelAdapter {
  readonly type = "WEB" as const;

  async handleInbound(_req: Request, _channel: Channel): Promise<InboundMessage | null> {
    return null;
  }

  async sendReply(): Promise<void> {
    // No-op: web replies are returned in the HTTP response body.
  }

  async testConnection(): Promise<boolean> {
    return true;
  }
}
