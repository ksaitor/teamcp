import type { ChannelType } from "@prisma/client";
import type { ChannelAdapter } from "./interface";
import { WebChannelAdapter } from "./web";
import { TelegramChannelAdapter } from "./telegram";
import { SlackChannelAdapter } from "./slack";
import { WhatsAppChannelAdapter } from "./whatsapp";

// Adapters are instantiated lazily on first use (and cached), rather than eagerly
// at module load. This avoids paying for unused adapters and, importantly, keeps
// module-evaluation free of cross-module construction — an adapter whose runner
// transitively imports the pipeline (which imports this registry) would otherwise
// form an init-time cycle and hit a temporal-dead-zone ReferenceError.
const factories: Record<ChannelType, () => ChannelAdapter> = {
  WEB: () => new WebChannelAdapter(),
  TELEGRAM: () => new TelegramChannelAdapter(),
  SLACK: () => new SlackChannelAdapter(),
  WHATSAPP: () => new WhatsAppChannelAdapter(),
};

const cache = new Map<ChannelType, ChannelAdapter>();

export function getChannelAdapter(type: ChannelType): ChannelAdapter {
  let adapter = cache.get(type);
  if (!adapter) {
    const factory = factories[type];
    if (!factory) throw new Error(`Unknown channel type: ${type}`);
    adapter = factory();
    cache.set(type, adapter);
  }
  return adapter;
}

export function getChannelTypes(): ChannelType[] {
  return Object.keys(factories) as ChannelType[];
}
