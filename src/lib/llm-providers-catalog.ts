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

/**
 * A recommended model for a provider. The model field stays free-text — these
 * are surfaced as one-click suggestions in the admin UI so non-technical owners
 * don't have to know exact model IDs. Keep each list to the provider's top few
 * current models, most-capable first (the first entry is the default).
 */
export interface SuggestedModel {
  /** Exact model ID sent to the provider's API. */
  id: string;
  /** Friendly name shown on the suggestion chip (defaults to `id`). */
  label?: string;
  /** Short role hint, e.g. "Most capable", "Fastest". */
  note?: string;
  /**
   * Whether the model supports tool/function calling. Teamcp exposes MCP
   * tools through an agent loop, so tool-capable models are suggested first;
   * models with `false` are listed last with a "No tool calls" warning.
   * Leave unset when unknown.
   */
  supportsToolCalls?: boolean;
}

/**
 * Orders suggestions for display: models that support tool calls first,
 * unknown next, models that can't call tools last. Stable within each group
 * so each provider's "most capable first" ordering is preserved.
 */
export function sortModelsByToolCalls(
  models: SuggestedModel[]
): SuggestedModel[] {
  const rank = (m: SuggestedModel) =>
    m.supportsToolCalls === true ? 0 : m.supportsToolCalls === false ? 2 : 1;
  return [...models].sort((a, b) => rank(a) - rank(b));
}

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
  /** Suggested models — the field stays free-text, these are quick picks. */
  suggestedModels: SuggestedModel[];
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
    suggestedModels: [
      { id: "gpt-4o", label: "GPT-4o", note: "Flagship", supportsToolCalls: true },
      { id: "gpt-4o-mini", label: "GPT-4o mini", note: "Fast & cheap", supportsToolCalls: true },
      { id: "o3", label: "o3", note: "Reasoning", supportsToolCalls: true },
      { id: "o3-mini", label: "o3-mini", supportsToolCalls: true },
      { id: "gpt-4.1", label: "GPT-4.1", supportsToolCalls: true },
    ],
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
      { id: "claude-opus-4-8", label: "Opus 4.8", note: "Most capable", supportsToolCalls: true },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "Balanced", supportsToolCalls: true },
      { id: "claude-haiku-4-5", label: "Haiku 4.5", note: "Fastest", supportsToolCalls: true },
      { id: "claude-opus-4-7", label: "Opus 4.7", supportsToolCalls: true },
      { id: "claude-opus-4-6", label: "Opus 4.6", supportsToolCalls: true },
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
    suggestedModels: [
      { id: "grok-4", label: "Grok 4", note: "Latest", supportsToolCalls: true },
      { id: "grok-3", label: "Grok 3", supportsToolCalls: true },
      { id: "grok-3-mini", label: "Grok 3 mini", note: "Fast", supportsToolCalls: true },
      { id: "grok-2-latest", label: "Grok 2", supportsToolCalls: true },
    ],
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
    suggestedModels: [
      { id: "kimi-k2-0905-preview", label: "Kimi K2", note: "Latest", supportsToolCalls: true },
      { id: "moonshot-v1-128k", label: "Moonshot v1 128k", note: "Long context", supportsToolCalls: true },
      { id: "moonshot-v1-32k", label: "Moonshot v1 32k", supportsToolCalls: true },
      { id: "moonshot-v1-8k", label: "Moonshot v1 8k", supportsToolCalls: true },
    ],
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
      { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8", note: "Most capable", supportsToolCalls: true },
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "Balanced", supportsToolCalls: true },
      { id: "openai/gpt-4o", label: "GPT-4o", supportsToolCalls: true },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Fast", supportsToolCalls: true },
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
    suggestedModels: [], // unknown endpoint — user supplies the model ID
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
