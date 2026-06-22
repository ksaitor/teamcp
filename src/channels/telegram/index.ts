import type { Channel } from "@prisma/client";
import { getConfig } from "@/lib/config";
import type { ChannelAdapter, ChannelRunner, InboundMessage, ReplyStream } from "../interface";
import {
  type TelegramUpdate,
  deleteWebhook,
  getBotToken,
  getMe,
  sendMessage,
  setWebhook,
  updateToInbound,
} from "./api";
import { TelegramPoller } from "./poller";
import { TelegramReplyStream } from "./stream";

export type TelegramDeliveryMode = "webhook" | "polling";

/**
 * Global Telegram delivery mode — an internal, code-level switch (NOT a
 * per-channel or end-user setting). Flip this constant to change how every
 * Telegram bot in this deployment receives updates:
 *
 *   "polling"  — in-process supervisor inside the unified server (server.ts).
 *                No public URL needed. Use on stateful Node/Bun hosts.
 *   "webhook"  — Telegram pushes to our /webhook route via setWebhook.
 *                Use on serverless deploys (e.g. Vercel).
 *
 * We deliberately keep this a single constant for now; if it ever needs to vary
 * per deployment, promote it to an env var here without touching call sites.
 */
export const TELEGRAM_DELIVERY_MODE: TelegramDeliveryMode = "polling";

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

  /**
   * Stream the turn: show "typing…" the moment the message lands, live-update a
   * draft as the agent generates text, then commit the final message. Telegram
   * is well-suited to this (native sendMessageDraft), so we always prefer it
   * over the single-shot sendReply.
   */
  async beginReplyStream(
    channel: Channel,
    threadRef: Record<string, any>
  ): Promise<ReplyStream> {
    const token = getBotToken(channel);
    const stream = new TelegramReplyStream(token, threadRef.chatId);
    await stream.start();
    return stream;
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
    if (TELEGRAM_DELIVERY_MODE === "webhook") {
      const url = `${getConfig().APP_URL}/api/channels/${channel.id}/webhook`;
      await setWebhook(token, url, channel.webhookSecret);
    } else {
      await deleteWebhook(token);
    }
  }

  /** Stop Telegram from pushing once a channel is disabled. */
  async teardownDelivery(channel: Channel): Promise<void> {
    await deleteWebhook(getBotToken(channel));
  }

  /**
   * In polling mode, the supervisor runs one long-poll loop per channel. In
   * webhook mode there's nothing to run (Telegram pushes to /webhook), so return
   * null and keep the mode decision local to this adapter.
   */
  createRunner(channel: Channel): ChannelRunner | null {
    if (TELEGRAM_DELIVERY_MODE !== "polling") return null;
    return new TelegramPoller(channel);
  }
}
