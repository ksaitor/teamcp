import type { ChannelType } from "@prisma/client";

/**
 * Hard cap on how many channels of a given type an organization may have.
 *
 * For now every channel type is limited to a single instance (one Telegram bot,
 * one Slack app, one WhatsApp number, one web surface). This is intentionally a
 * constant rather than a per-org/plan setting — when we introduce tiers that
 * allow multiple bots, raise this (or make it a lookup keyed by plan + type).
 */
export const MAX_CHANNELS_PER_TYPE = 1;

/** Human-friendly label for the limit error message. */
export function channelLimitMessage(type: ChannelType): string {
  return `Only ${MAX_CHANNELS_PER_TYPE} ${type} channel is allowed per organization.`;
}
