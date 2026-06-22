import { decrypt } from "@/lib/crypto";
import type { Channel } from "@prisma/client";
import type { InboundMessage } from "../interface";
import { MAX_MESSAGE_LENGTH, chunkMarkdown, htmlToPlainText, markdownToHtml } from "./markdown";

/**
 * Thin wrapper around the Telegram Bot API. Each org brings its own bot token
 * (stored encrypted on the channel row); nothing here is centralized.
 *
 * https://core.telegram.org/bots/api
 */

const API_BASE = "https://api.telegram.org";

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

/**
 * Send an assistant reply, rendering the Markdown the agent emits as Telegram
 * HTML so the user sees formatted text (bold, code, links, …) instead of raw
 * markup. Splits on Markdown boundaries so each message is valid, balanced
 * HTML, and falls back to plain text if Telegram ever rejects the markup so a
 * reply is never silently dropped.
 */
export async function sendFormattedMessage(
  token: string,
  chatId: number | string,
  markdown: string
) {
  const source = markdown.trim() || "(no response)";
  for (const chunk of chunkMarkdown(source)) {
    const html = markdownToHtml(chunk);
    // A single chunk is normally within the limit; hard-split the rare oversized
    // one (e.g. a huge code block) at line boundaries as a last resort.
    for (const piece of hardSplit(html, MAX_MESSAGE_LENGTH)) {
      await sendHtmlPiece(token, chatId, piece);
    }
  }
}

async function sendHtmlPiece(token: string, chatId: number | string, html: string) {
  try {
    await call(token, "sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
    });
  } catch (err) {
    // Unbalanced/unsupported markup → Telegram 400. Resend as plain text rather
    // than lose the reply.
    if (err instanceof TelegramApiError && /can't parse|entities|tag/i.test(err.description)) {
      await sendMessage(token, chatId, htmlToPlainText(html));
      return;
    }
    throw err;
  }
}

/** Split text into <=max pieces, preferring the last newline before the cap. */
function hardSplit(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    const nl = slice.lastIndexOf("\n");
    const cut = nl > max * 0.5 ? nl : max;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/**
 * Show a status (default "typing…") in the chat. The status auto-clears after
 * ~5s, so callers re-send it periodically to keep it alive across a long turn.
 * https://core.telegram.org/bots/api#sendchataction
 */
export function sendChatAction(
  token: string,
  chatId: number | string,
  action: string = "typing"
) {
  return call(token, "sendChatAction", { chat_id: chatId, action });
}

/**
 * Stream a partial assistant message as a live "draft" the user watches being
 * typed (Bot API 9.3+, opened to all bots in 9.5). Call repeatedly with the
 * growing text, then commit the turn with `sendMessage` and clear the draft.
 * It's built for high-frequency updates, so it avoids the 429s the old
 * "send once, then editMessageText repeatedly" approach risked. Drafts share
 * the message length cap, so we send only the head while a long reply streams;
 * the committed `sendMessage` chunks the full text.
 */
export function sendMessageDraft(token: string, chatId: number | string, text: string) {
  return call(token, "sendMessageDraft", {
    chat_id: chatId,
    text: text.slice(0, MAX_MESSAGE_LENGTH),
  });
}

/** Clear the streaming draft (empty text, Bot API 10.0+) once the real message is committed. */
export function clearMessageDraft(token: string, chatId: number | string) {
  return call(token, "sendMessageDraft", { chat_id: chatId, text: "" });
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
