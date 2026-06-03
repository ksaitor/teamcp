import type { Channel } from "@prisma/client";
import { getConfig } from "@/lib/config";
import type { ChannelAdapter, InboundMessage } from "../interface";
import {
  type TelegramUpdate,
  deleteWebhook,
  getBotToken,
  getMe,
  sendMessage,
  setWebhook,
} from "./api";

export type TelegramDeliveryMode = "webhook" | "polling";

/**
 * Default delivery mode. Polling runs a standalone, stateful worker process
 * (`bun run bot:telegram`) and needs no public URL — the right default for
 * long-running Node/Bun hosts. Serverless deploys (e.g. Vercel) should pick
 * "webhook" explicitly when creating the channel.
 */
export const DEFAULT_TELEGRAM_DELIVERY_MODE: TelegramDeliveryMode = "polling";

/** Read the per-channel delivery mode from `config`, falling back to the default. */
export function getTelegramDeliveryMode(channel: Pick<Channel, "config">): TelegramDeliveryMode {
  const mode = (channel.config as { deliveryMode?: string } | null)?.deliveryMode;
  return mode === "webhook" || mode === "polling" ? mode : DEFAULT_TELEGRAM_DELIVERY_MODE;
}

/**
 * Map a raw Telegram `Update` to our channel-agnostic InboundMessage. Returns
 * null for updates we don't act on (non-message, non-text). Shared by the
 * webhook adapter and the polling worker so both paths behave identically.
 */
export function updateToInbound(update: TelegramUpdate): InboundMessage | null {
  const message = update.message;
  if (!message || !message.text) return null;

  const chatId = message.chat.id;
  const displayName =
    message.from?.username ||
    [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
    message.chat.title;

  return {
    externalId: String(chatId),
    displayName: displayName || undefined,
    externalThreadId: String(chatId),
    text: message.text,
    threadRef: { chatId },
  };
}

export class TelegramChannelAdapter implements ChannelAdapter {
  readonly type = "TELEGRAM" as const;

  async handleInbound(req: Request, channel: Channel): Promise<InboundMessage | null> {
    // Verify the secret token Telegram echoes back on every webhook delivery.
    const secret = req.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== channel.webhookSecret) return null;

    const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
    if (!update) return null;
    return updateToInbound(update);
  }

  async sendReply(
    channel: Channel,
    threadRef: Record<string, any>,
    text: string
  ): Promise<void> {
    const token = getBotToken(channel);
    await sendMessage(token, threadRef.chatId, text);
  }

  async testConnection(
    channel: Pick<Channel, "type" | "config" | "credentialsEncrypted">
  ): Promise<boolean> {
    try {
      const token = getBotToken(channel);
      await getMe(token);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reconcile Telegram's delivery configuration to match the channel's mode:
   * webhook → register our receiver URL; polling → clear any webhook so
   * `getUpdates` is permitted. Called after the channel is created/updated.
   */
  async configureDelivery(channel: Channel): Promise<void> {
    const token = getBotToken(channel);
    const mode = getTelegramDeliveryMode(channel);
    if (mode === "webhook") {
      const url = `${getConfig().APP_URL}/api/channels/${channel.id}/webhook`;
      await setWebhook(token, url, channel.webhookSecret);
    } else {
      await deleteWebhook(token);
    }
  }
}
