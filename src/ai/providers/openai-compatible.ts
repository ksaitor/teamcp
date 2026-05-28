import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from "./types";

interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
}

/**
 * Client for any OpenAI-compatible chat-completions API.
 * Covers OpenAI, xAI, Kimi, OpenRouter, and custom endpoints — they differ
 * only by base URL (and occasionally extra headers).
 */
export class OpenAiCompatibleClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(opts: OpenAiCompatibleOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.extraHeaders = opts.extraHeaders ?? {};
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.extraHeaders,
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const messages = req.system
      ? [{ role: "system", content: req.system }, ...req.messages]
      : req.messages;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 2048,
        messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 500)}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error("LLM response missing choices[0].message.content");
    }
    return { text };
  }

  async testConnection(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.headers(),
    });
    return res.ok;
  }
}
