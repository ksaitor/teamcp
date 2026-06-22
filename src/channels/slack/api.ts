import { createHmac, timingSafeEqual } from "crypto";
import { decrypt } from "@/lib/crypto";
import type { Channel } from "@prisma/client";
import type { InboundMessage } from "../interface";

/**
 * Thin wrapper around the Slack Web API + Socket Mode. Each org brings its own
 * Slack app credentials (stored encrypted on the channel row); nothing here is
 * centralized.
 *
 * Two delivery paths are supported (mode picked in ./index.ts):
 *   - Socket Mode  — the server opens a WebSocket to Slack (apps.connections.open).
 *                    No public URL needed; mirrors Telegram long-polling.
 *   - Events API   — Slack POSTs to our /webhook route; we verify the request
 *                    signature with the app's signing secret.
 *
 * https://api.slack.com/web · https://api.slack.com/apis/socket-mode
 */

const API_BASE = "https://slack.com/api";

// chat.postMessage accepts very long `text`, but keep chunks modest for
// readability and to stay clear of block limits.
const MAX_MESSAGE_LENGTH = 3500;

// Reject Events API deliveries whose timestamp is older than this, to blunt
// replay of a captured (signed) request.
const MAX_SIGNATURE_AGE_S = 60 * 5;

export interface SlackCredentials {
  /** Bot user OAuth token (xoxb-…). Always required: auth.test + chat.postMessage. */
  botToken: string;
  /** App signing secret. Required for Events API (webhook) signature verification. */
  signingSecret?: string;
  /** App-level token (xapp-…) with connections:write. Required for Socket Mode. */
  appToken?: string;
}

/** A Slack Events API event (same shape over HTTP and inside a Socket Mode frame). */
export interface SlackEvent {
  type: string; // "message" | "app_mention" | …
  subtype?: string; // "message_changed", "bot_message", "channel_join", …
  channel?: string;
  channel_type?: string; // "im" | "channel" | "group" | "mpim"
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
}

/** Top-level Events API envelope delivered over HTTP. */
export interface SlackEventEnvelope {
  type: string; // "url_verification" | "event_callback"
  challenge?: string;
  event?: SlackEvent;
}

export class SlackApiError extends Error {
  constructor(
    public method: string,
    public slackError: string
  ) {
    super(`Slack ${method} failed: ${slackError}`);
    this.name = "SlackApiError";
  }
}

async function call<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok: boolean;
    error?: string;
  } & Record<string, any>;
  if (!data.ok) {
    throw new SlackApiError(method, data.error ?? "unknown_error");
  }
  return data as T;
}

/**
 * Decrypt and parse the Slack credential blob stored on a channel. The blob is
 * JSON: { botToken, appToken?, signingSecret? } (snake_case keys also accepted).
 */
export function getCredentials(
  channel: Pick<Channel, "credentialsEncrypted">
): SlackCredentials {
  if (!channel.credentialsEncrypted) {
    throw new Error("Slack channel has no credentials configured");
  }
  let parsed: any;
  try {
    parsed = JSON.parse(decrypt(channel.credentialsEncrypted));
  } catch {
    throw new Error("Slack credentials are not valid JSON");
  }
  const botToken = String(parsed.botToken ?? parsed.bot_token ?? "").trim();
  if (!botToken) {
    throw new Error("Slack credentials must include a botToken (xoxb-…)");
  }
  const appToken = String(parsed.appToken ?? parsed.app_token ?? "").trim();
  const signingSecret = String(
    parsed.signingSecret ?? parsed.signing_secret ?? ""
  ).trim();
  return {
    botToken,
    appToken: appToken || undefined,
    signingSecret: signingSecret || undefined,
  };
}

export function authTest(botToken: string) {
  return call<{ user_id: string; team_id: string; bot_id?: string; url: string }>(
    botToken,
    "auth.test"
  );
}

export async function postMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string
) {
  // Never post an empty body — Slack rejects it; agent turns should always
  // produce text, but guard anyway so a reply is never silently dropped.
  const safe = text.length > 0 ? text : "(no response)";
  for (let i = 0; i < safe.length; i += MAX_MESSAGE_LENGTH) {
    const chunk = safe.slice(i, i + MAX_MESSAGE_LENGTH);
    await call(botToken, "chat.postMessage", {
      channel,
      text: chunk,
      thread_ts: threadTs,
    });
  }
}

/**
 * Open a Socket Mode WebSocket URL. The app-level token (xapp-…) authorizes the
 * connection; the returned wss URL is single-use and short-lived.
 */
export function openSocketUrl(appToken: string) {
  return call<{ url: string }>(appToken, "apps.connections.open");
}

/**
 * Verify a Slack request signature (v0 scheme). Guards against forged webhook
 * deliveries and replays of an old (but validly signed) request.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(opts: {
  signingSecret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
}): boolean {
  const { signingSecret, timestamp, signature, rawBody } = opts;
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > MAX_SIGNATURE_AGE_S) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected =
    "v0=" + createHmac("sha256", signingSecret).update(base).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Strip leading bot mentions ("<@U123> ask…") so the agent sees clean text. */
function stripLeadingMentions(text: string): string {
  return text.replace(/^(?:\s*<@[^>]+>\s*)+/, "").trim();
}

/**
 * Map a raw Slack event to our channel-agnostic InboundMessage. Returns null for
 * events we don't act on (non-message, edits/deletes, anything authored by a
 * bot — including our own replies). Shared by the webhook adapter and the Socket
 * Mode runner so both paths behave identically.
 */
export function eventToInbound(event: SlackEvent | undefined): InboundMessage | null {
  if (!event) return null;
  if (event.type !== "message" && event.type !== "app_mention") return null;
  // Ignore bot-authored messages (our own echoes set bot_id) and any subtype
  // (message_changed/deleted, channel_join, bot_message, …).
  if (event.bot_id) return null;
  if (event.subtype) return null;

  const user = event.user;
  const channelId = event.channel;
  const text = event.text;
  if (!user || !channelId || !text) return null;

  // Reply in-thread when the incoming message is threaded; for an app_mention in
  // a channel, root a thread on the mention so the exchange stays tidy.
  const threadTs =
    event.thread_ts ?? (event.type === "app_mention" ? event.ts : undefined);

  return {
    externalId: user,
    // Slack user ids (U…) aren't human-friendly and resolving names needs an
    // extra scope + API call; leave the display name unset.
    displayName: undefined,
    externalThreadId: `${channelId}:${threadTs ?? ""}`,
    text: stripLeadingMentions(text),
    threadRef: { channel: channelId, threadTs },
  };
}
