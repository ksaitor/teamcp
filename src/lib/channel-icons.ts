import type { IconType } from "react-icons";
import { FiGlobe } from "react-icons/fi";
import { SiTelegram, SiSlack, SiWhatsapp } from "react-icons/si";
import type { ChannelType } from "@prisma/client";

/**
 * Single source of truth for how each channel type is presented in the admin UI
 * (the create form and the channels list). Brand logos come from react-icons/si
 * (Simple Icons), matching the llm-providers / connectors catalogs; the web
 * surface has no brand, so it uses a Feather globe.
 */
export const CHANNEL_META: Record<
  ChannelType,
  { label: string; icon: IconType }
> = {
  WEB: { label: "Web chat", icon: FiGlobe },
  TELEGRAM: { label: "Telegram", icon: SiTelegram },
  SLACK: { label: "Slack", icon: SiSlack },
  WHATSAPP: { label: "WhatsApp", icon: SiWhatsapp },
};
