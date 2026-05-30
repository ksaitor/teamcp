import type { Channel } from "@prisma/client";
import type { ChannelAdapter, InboundMessage } from "../interface";

/** Stub. Will use Slack Events API + signing secret verification. */
export class SlackChannelAdapter implements ChannelAdapter {
  readonly type = "SLACK" as const;

  async handleInbound(_req: Request, _channel: Channel): Promise<InboundMessage | null> {
    throw new Error("Slack channel not yet implemented");
  }

  async sendReply(): Promise<void> {
    throw new Error("Slack channel not yet implemented");
  }

  async testConnection(): Promise<boolean> {
    return false;
  }
}
