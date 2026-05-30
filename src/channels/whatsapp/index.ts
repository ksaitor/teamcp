import type { Channel } from "@prisma/client";
import type { ChannelAdapter, InboundMessage } from "../interface";

/** Stub. Will use WhatsApp Cloud API + app secret signature verification. */
export class WhatsAppChannelAdapter implements ChannelAdapter {
  readonly type = "WHATSAPP" as const;

  async handleInbound(_req: Request, _channel: Channel): Promise<InboundMessage | null> {
    throw new Error("WhatsApp channel not yet implemented");
  }

  async sendReply(): Promise<void> {
    throw new Error("WhatsApp channel not yet implemented");
  }

  async testConnection(): Promise<boolean> {
    return false;
  }
}
