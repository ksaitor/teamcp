/**
 * Telegram long-polling runner: one per ACTIVE channel in polling mode. Owns a
 * getUpdates loop with its own update offset and capped backoff, feeding each
 * message through the shared `processInboundMessage` pipeline so polling and
 * webhook deliveries behave identically. Lifecycle (start/stop/refresh) is driven
 * by the generic channel supervisor.
 */
import type { Channel } from "@prisma/client";
import { processInboundMessage } from "@/channels/process";
import type { ChannelRunner } from "@/channels/interface";
import { deleteWebhook, getBotToken, getUpdates, updateToInbound } from "./api";

const LONG_POLL_TIMEOUT_S = 50;
const MAX_BACKOFF_MS = 60_000;

export class TelegramPoller implements ChannelRunner {
  private aborted = false;
  private offset = 0;
  channel: Channel;

  constructor(channel: Channel) {
    this.channel = channel;
  }

  /** Swap in a fresh channel snapshot (e.g. token rotated) without losing offset. */
  update(channel: Channel) {
    this.channel = channel;
  }

  stop() {
    this.aborted = true;
  }

  async start() {
    // Polling and webhooks are mutually exclusive on Telegram's side.
    try {
      await deleteWebhook(getBotToken(this.channel));
    } catch (err) {
      console.error(`[telegram] deleteWebhook failed for channel ${this.channel.id}`, err);
    }
    console.log(`[telegram] polling started for channel ${this.channel.id} (${this.channel.name})`);

    let backoff = 1000;
    while (!this.aborted) {
      try {
        const token = getBotToken(this.channel);
        const updates = await getUpdates(token, this.offset, LONG_POLL_TIMEOUT_S);
        backoff = 1000; // reset after a clean poll
        for (const update of updates) {
          this.offset = update.update_id + 1;
          if (this.aborted) break;
          const inbound = updateToInbound(update);
          if (!inbound) continue;
          try {
            await processInboundMessage(this.channel, inbound);
          } catch (err) {
            console.error(`[telegram] turn failed for channel ${this.channel.id}`, err);
          }
        }
      } catch (err) {
        if (this.aborted) break;
        console.error(`[telegram] poll error for channel ${this.channel.id}, backing off ${backoff}ms`, err);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
    console.log(`[telegram] polling stopped for channel ${this.channel.id}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
