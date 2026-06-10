import { decrypt } from "@/lib/crypto";
import type { Channel } from "@prisma/client";
import type { InboundMessage } from "../interface";

/**
 * Thin wrapper around the Telegram Bot API. Each org brings its own bot token
 * (stored encrypted on the channel row); nothing here is centralized.
 *
 * https://core.telegram.org/bots/api
 */

const API_BASE = "https://api.telegram.org";

// Telegram rejects messages longer than 4096 UTF-16 code units.
const MAX_MESSAGE_LENGTH = 4096;

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: { id: number; type: string; title?: string };
  from?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

export class TelegramApiError extends Error {
  constructor(
    public method: string,
    public errorCode: number | undefined,
    public description: string
  ) {
    super(`Telegram ${method} failed: ${errorCode ?? "?"} ${description}`);
    this.name = "TelegramApiError";
  }
}

async function call<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok: boolean;
    result?: T;
    error_code?: number;
    description?: string;
  };
  if (!data.ok) {
    throw new TelegramApiError(method, data.error_code, data.description ?? "unknown error");
  }
  return data.result as T;
}

/** Decrypt the bot token stored on a channel. The token is the whole credential blob. */
export function getBotToken(channel: Pick<Channel, "credentialsEncrypted">): string {
  if (!channel.credentialsEncrypted) {
    throw new Error("Telegram channel has no bot token configured");
  }
  return decrypt(channel.credentialsEncrypted).trim();
}

export function getMe(token: string) {
  return call<{ id: number; username?: string; first_name?: string }>(token, "getMe");
}

export async function sendMessage(token: string, chatId: number | string, text: string) {
  // Chunk long replies so we never trip Telegram's length limit.
  for (let i = 0; i < text.length; i += MAX_MESSAGE_LENGTH) {
    const chunk = text.slice(i, i + MAX_MESSAGE_LENGTH);
    await call(token, "sendMessage", { chat_id: chatId, text: chunk });
  }
}

export function setWebhook(token: string, url: string, secretToken: string) {
  return call(token, "setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message"],
  });
}

export function deleteWebhook(token: string) {
  return call(token, "deleteWebhook");
}

export function getUpdates(token: string, offset: number, timeoutSeconds: number) {
  return call<TelegramUpdate[]>(token, "getUpdates", {
    offset,
    timeout: timeoutSeconds,
    allowed_updates: ["message"],
  });
}

/**
 * Map a raw Telegram `Update` to our channel-agnostic InboundMessage. Returns
 * null for updates we don't act on (non-message, non-text). Shared by the
 * webhook adapter and the polling runner so both paths behave identically.
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
