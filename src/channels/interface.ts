import type { Channel, ChannelIdentity, ChannelType } from "@prisma/client";

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
   * Optional: when an unlinked sender DMs the bot with a string that looks like
   * a link code, the adapter consumes the code and creates the ChannelIdentity.
   */
  tryConsumeLinkCode?(
    channel: Channel,
    inbound: InboundMessage
  ): Promise<ChannelIdentity | null>;

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
}
