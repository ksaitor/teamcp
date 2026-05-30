import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmAgentRequest,
  LlmAgentResponse,
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmToolCall,
  LlmTurnMessage,
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

  async agentTurn(req: LlmAgentRequest): Promise<LlmAgentResponse> {
    return anthropicAgentTurn(this.client, req);
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

// Shared implementation reused by the env-fallback client in resolve.ts.
export async function anthropicAgentTurn(
  client: Anthropic,
  req: LlmAgentRequest
): Promise<LlmAgentResponse> {
  const response = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens ?? 4096,
    ...(req.system ? { system: req.system } : {}),
    tools: req.tools.map((t) => ({
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      input_schema: (t.inputSchema as any) ?? { type: "object", properties: {} },
    })),
    messages: toAnthropicMessages(req.messages),
  });

  let text = "";
  const toolCalls: LlmToolCall[] = [];
  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: (block.input as Record<string, any>) ?? {},
      });
    }
  }

  const stopReason = mapStopReason(response.stop_reason);
  return { text, toolCalls, stopReason };
}

function toAnthropicMessages(messages: LlmTurnMessage[]) {
  // Anthropic format: tool_use blocks live on assistant turns; tool_result
  // blocks live on user turns. Collapse adjacent tool messages onto the next
  // user turn (or create one).
  const out: Array<{ role: "user" | "assistant"; content: any }> = [];
  let pendingToolResults: any[] = [];

  const flushPending = () => {
    if (pendingToolResults.length === 0) return;
    out.push({ role: "user", content: pendingToolResults });
    pendingToolResults = [];
  };

  for (const m of messages) {
    if (m.role === "tool") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
        ...(m.isError ? { is_error: true } : {}),
      });
      continue;
    }

    if (m.role === "user") {
      flushPending();
      out.push({ role: "user", content: m.content });
      continue;
    }

    // assistant
    flushPending();
    const blocks: any[] = [];
    if (m.content) blocks.push({ type: "text", text: m.content });
    for (const tc of m.toolCalls ?? []) {
      blocks.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.input,
      });
    }
    out.push({ role: "assistant", content: blocks.length > 0 ? blocks : "" });
  }

  flushPending();
  return out;
}

function mapStopReason(reason: string | null): LlmAgentResponse["stopReason"] {
  if (reason === "end_turn") return "end_turn";
  if (reason === "tool_use") return "tool_use";
  if (reason === "max_tokens") return "max_tokens";
  return "other";
}
