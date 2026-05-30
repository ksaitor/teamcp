import type { ChannelType } from "@prisma/client";
import type { ChannelAdapter } from "./interface";
import { WebChannelAdapter } from "./web";
import { TelegramChannelAdapter } from "./telegram";
import { SlackChannelAdapter } from "./slack";
import { WhatsAppChannelAdapter } from "./whatsapp";

const adapters: Record<ChannelType, ChannelAdapter> = {
  WEB: new WebChannelAdapter(),
  TELEGRAM: new TelegramChannelAdapter(),
  SLACK: new SlackChannelAdapter(),
  WHATSAPP: new WhatsAppChannelAdapter(),
};

export function getChannelAdapter(type: ChannelType): ChannelAdapter {
  const adapter = adapters[type];
  if (!adapter) throw new Error(`Unknown channel type: ${type}`);
  return adapter;
}

export function getChannelTypes(): ChannelType[] {
  return Object.keys(adapters) as ChannelType[];
}
