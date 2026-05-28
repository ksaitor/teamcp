import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from "./types";

interface AnthropicOptions {
  apiKey: string;
  baseUrl?: string;
}

/** Client wrapping the Anthropic Messages API. */
export class AnthropicClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(opts: AnthropicOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}),
    });
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 2048,
      ...(req.system ? { system: req.system } : {}),
      messages: req.messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    });

    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Anthropic returned a non-text response");
    }
    return { text: block.text };
  }

  async testConnection(): Promise<boolean> {
    await this.client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  }
}
