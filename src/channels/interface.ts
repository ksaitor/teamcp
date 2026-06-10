import type { Channel, ChannelType } from "@prisma/client";

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
  /** Signal the loop to stop on its next iteration. */
  stop(): void;
  /** Swap in a fresh channel snapshot without restarting. */
  update(channel: Channel): void;
}

export interface ChannelAdapter {
  type: ChannelType;

  /**
   * Verify the signature on a raw webhook request and decode it. Returns null
   * if the payload is something we don't act on (e.g. delivery receipt, ack).
   */
  handleInbound(req: Request, channel: Channel): Promise<InboundMessage | null>;

  /**
   * Send one assistant message back to the external user.
   */
  sendReply(
    channel: Channel,
    threadRef: Record<string, any>,
    text: string
  ): Promise<void>;

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
