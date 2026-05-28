import { FiServer } from "react-icons/fi";
import { SiOpenai, SiAnthropic } from "react-icons/si";
import type { IconType } from "react-icons";

export type LlmProviderType =
  | "OPENAI"
  | "ANTHROPIC"
  | "XAI"
  | "KIMI"
  | "OPENROUTER"
  | "CUSTOM_OPENAI";

export interface LlmProviderCatalogEntry {
  type: LlmProviderType;
  slug: string;
  label: string;
  description: string;
  /** react-icons brand mark (used when no logo file is set). */
  icon?: IconType;
  /** Path under /public to a currentColor SVG brand mark. */
  logo?: string;
  /** Default API base URL. Empty means the user must provide one (custom endpoints). */
  defaultBaseUrl: string;
  /** Whether the base URL field is shown/editable in the form. */
  baseUrlEditable: boolean;
  requiresApiKey: boolean;
  /** Suggested model IDs — the field stays free-text. */
  suggestedModels: string[];
}

export const llmProviderCatalog: LlmProviderCatalogEntry[] = [
  {
    type: "OPENAI",
    slug: "openai",
    label: "OpenAI",
    description: "GPT models via the OpenAI API.",
    icon: SiOpenai,
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlEditable: true,
    requiresApiKey: true,
    suggestedModels: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
  },
  {
    type: "ANTHROPIC",
    slug: "anthropic",
    label: "Anthropic",
    description: "Claude models via the Anthropic API.",
    icon: SiAnthropic,
    defaultBaseUrl: "https://api.anthropic.com",
    baseUrlEditable: true,
    requiresApiKey: true,
    suggestedModels: [
      "claude-sonnet-4-20250514",
      "claude-3-5-haiku-20241022",
    ],
  },
  {
    type: "XAI",
    slug: "xai",
    label: "xAI (Grok)",
    description: "Grok models via the xAI API (OpenAI-compatible).",
    logo: "/llm-logos/xai.svg",
    defaultBaseUrl: "https://api.x.ai/v1",
    baseUrlEditable: true,
    requiresApiKey: true,
    suggestedModels: ["grok-2-latest", "grok-beta"],
  },
  {
    type: "KIMI",
    slug: "kimi",
    label: "Kimi (Moonshot)",
    description: "Moonshot Kimi models (OpenAI-compatible).",
    logo: "/llm-logos/kimi.svg",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    baseUrlEditable: true,
    requiresApiKey: true,
    suggestedModels: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  {
    type: "OPENROUTER",
    slug: "openrouter",
    label: "OpenRouter",
    description: "Hundreds of models through one OpenRouter key.",
    logo: "/llm-logos/openrouter.svg",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    baseUrlEditable: true,
    requiresApiKey: true,
    suggestedModels: [
      "openai/gpt-4o",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.0-flash-001",
    ],
  },
  {
    type: "CUSTOM_OPENAI",
    slug: "custom-openai",
    label: "Custom (OpenAI-compatible)",
    description: "Any OpenAI-compatible endpoint — self-hosted or third-party.",
    icon: FiServer,
    defaultBaseUrl: "",
    baseUrlEditable: true,
    requiresApiKey: false,
    suggestedModels: [],
  },
];

export function getLlmCatalogEntry(
  slug: string
): LlmProviderCatalogEntry | undefined {
  return llmProviderCatalog.find((e) => e.slug === slug);
}

export function getLlmCatalogEntryByType(
  type: LlmProviderType
): LlmProviderCatalogEntry | undefined {
  return llmProviderCatalog.find((e) => e.type === type);
}
