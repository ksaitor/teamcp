import type { Channel, ChannelType } from "@prisma/client";
import type { AgentEvent } from "@/agent/run";

export interface InboundMessage {
  /** External user id (telegram chat_id, slack user id, etc.) */
  externalId: string;
  /** Display name to attach to a newly-created ChannelIdentity. */
  displayName?: string;
  /** External thread/conversation id, if the channel has one. */
  externalThreadId?: string;
  /** Raw user text. */
  text: string;
  /**
   * Reference an adapter passes back to itself when sending the reply.
   * Encodes whatever the underlying API needs (telegram chat_id, slack channel + ts, ...).
   */
  threadRef: Record<string, any>;
}

/**
 * A long-lived per-channel process that pulls inbound messages from a platform
 * that can't (or shouldn't) push to us via webhook — e.g. Telegram long-polling
 * or Slack Socket Mode. The shared supervisor (src/channels/supervisor.ts) owns
 * the lifecycle; the runner just needs to start, stop, and accept a refreshed
 * channel snapshot (e.g. after a token rotation) without losing its place.
 */
export interface ChannelRunner {
  /** Begin pulling messages. Resolves/returns when stopped; errors are handled internally. */
  start(): Promise<void> | void;
  /**
   * Signal the loop to stop and tear down any open connection to the platform.
   * Implementations should abort in-flight long-polls / close sockets so the
   * platform releases the single-consumer slot immediately (otherwise a redeploy
   * races the old instance — e.g. Telegram's 409 "terminated by other getUpdates").
   * May be async; the supervisor awaits it during shutdown.
   */
  stop(): void | Promise<void>;
  /** Swap in a fresh channel snapshot without restarting. */
  update(channel: Channel): void;
}

/**
 * A live, in-progress reply for channels that can show output as it's produced
 * (e.g. a typing indicator plus streaming partial text). The inbound pipeline
 * drives one agent turn through `onEvent` (text deltas, tool start/stop), then
 * calls `finish` exactly once with the completed assistant text to commit the
 * reply and tear down any live preview.
 */
export interface ReplyStream {
  /** Consume one streamed agent event. Must not throw or block the turn. */
  onEvent(event: AgentEvent): void;
  /** Commit the finished reply (and clear any live preview). Called once. */
  finish(assistantText: string): Promise<void>;
}

export interface ChannelAdapter {
  type: ChannelType;

  /**
   * Verify the signature on a raw webhook request and decode it. Returns null
   * if the payload is something we don't act on (e.g. delivery receipt, ack).
   */
  handleInbound(req: Request, channel: Channel): Promise<InboundMessage | null>;

  /**
   * Optional: produce a raw HTTP response for inbound webhook requests the
   * standard InboundMessage pipeline can't express — e.g. Slack's
   * url_verification handshake, which must echo `challenge` back in the body.
   * Called before handleInbound; return null to defer to it. Implementations
   * read the request body, so the webhook route passes a clone.
   */
  handleWebhookHandshake?(req: Request, channel: Channel): Promise<Response | null>;

  /**
   * Send one assistant message back to the external user.
   */
  sendReply(
    channel: Channel,
    threadRef: Record<string, any>,
    text: string
  ): Promise<void>;

  /**
   * Optional: start a streaming reply so the user sees the assistant respond as
   * it's generated (e.g. Telegram's typing indicator + sendMessageDraft). The
   * inbound pipeline prefers this over `sendReply` when present, feeding it
   * agent events and finishing with the completed text. Omit for channels that
   * can only post a single finished message.
   */
  beginReplyStream?(
    channel: Channel,
    threadRef: Record<string, any>
  ): Promise<ReplyStream>;

  /**
   * Validate credentials when the org creates/updates the channel.
   */
  testConnection(
    channel: Pick<Channel, "type" | "config" | "credentialsEncrypted">
  ): Promise<boolean>;

  /**
   * Optional: reconcile the external platform's delivery configuration with the
   * channel's settings after a create/update (e.g. Telegram setWebhook vs
   * deleteWebhook depending on webhook/polling mode). No-op for channels that
   * don't push to an external API.
   */
  configureDelivery?(channel: Channel): Promise<void>;

  /**
   * Optional: tear down external delivery when a channel is disabled (e.g.
   * Telegram deleteWebhook so the platform stops pushing updates). No-op for
   * channels that don't push to an external API.
   */
  teardownDelivery?(channel: Channel): Promise<void>;

  /**
   * Optional: build a long-lived runner for channels that pull messages instead
   * of receiving webhooks (Telegram polling, Slack Socket Mode). The shared
   * supervisor calls this for each ACTIVE channel and manages start/stop/refresh.
   * Return null when no runner is needed in the current delivery mode (e.g.
   * Telegram configured for webhook delivery), so mode logic stays adapter-local.
   * Omit entirely for channels that only receive webhooks or run in-request.
   */
  createRunner?(channel: Channel): ChannelRunner | null;
}
