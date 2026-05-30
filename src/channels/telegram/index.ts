import type { Channel } from "@prisma/client";
import type { ChannelAdapter, InboundMessage } from "../interface";

/**
 * Stub. Real implementation will:
 *  - verify `X-Telegram-Bot-Api-Secret-Token` against `channel.webhookSecret`
 *  - parse `Update` → message
 *  - POST sendMessage with the decrypted bot token
 */
export class TelegramChannelAdapter implements ChannelAdapter {
  readonly type = "TELEGRAM" as const;

  async handleInbound(_req: Request, _channel: Channel): Promise<InboundMessage | null> {
    throw new Error("Telegram channel not yet implemented");
  }

  async sendReply(): Promise<void> {
    throw new Error("Telegram channel not yet implemented");
  }

  async testConnection(): Promise<boolean> {
    return false;
  }
}
