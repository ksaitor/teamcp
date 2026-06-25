import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmAgentRequest,
  LlmAgentResponse,
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmStreamEvent,
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
    return { text: block.text, usage: anthropicUsage(response.usage) };
  }

  async agentTurn(req: LlmAgentRequest): Promise<LlmAgentResponse> {
    return anthropicAgentTurn(this.client, req);
  }

  async agentTurnStream(
    req: LlmAgentRequest,
    onEvent: (e: LlmStreamEvent) => void
  ): Promise<LlmAgentResponse> {
    return anthropicAgentTurnStream(this.client, req, onEvent);
  }

  async testConnection(model?: string): Promise<boolean> {
    // Test against the model the org configured so the result reflects what
    // they'll actually call; fall back to a current cheap model if none given.
    await this.client.messages.create({
      model: model || "claude-haiku-4-5",
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
  return { text, toolCalls, stopReason, usage: anthropicUsage(response.usage) };
}

export async function anthropicAgentTurnStream(
  client: Anthropic,
  req: LlmAgentRequest,
  onEvent: (e: LlmStreamEvent) => void
): Promise<LlmAgentResponse> {
  const stream = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens ?? 4096,
    ...(req.system ? { system: req.system } : {}),
    tools: req.tools.map((t) => ({
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      input_schema: (t.inputSchema as any) ?? { type: "object", properties: {} },
    })),
    messages: toAnthropicMessages(req.messages),
    stream: true,
  });

  let text = "";
  let stopReason: LlmAgentResponse["stopReason"] = "other";
  let inputTokens = 0;
  let outputTokens = 0;
  type PartialBlock =
    | { kind: "text"; text: string }
    | { kind: "tool_use"; id: string; name: string; jsonBuf: string };
  const blocks: PartialBlock[] = [];

  for await (const event of stream) {
    if (event.type === "message_start") {
      // Initial usage: input_tokens is final here; output_tokens accrues via
      // message_delta below.
      const usage = (event as any).message?.usage;
      if (usage) {
        inputTokens =
          (usage.input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0);
        outputTokens = usage.output_tokens ?? 0;
      }
    } else if (event.type === "content_block_start") {
      const block: any = (event as any).content_block;
      if (block?.type === "text") {
        blocks[event.index] = { kind: "text", text: block.text ?? "" };
        if (block.text) {
          text += block.text;
          onEvent({ type: "text", delta: block.text });
        }
      } else if (block?.type === "tool_use") {
        blocks[event.index] = {
          kind: "tool_use",
          id: block.id,
          name: block.name,
          jsonBuf: "",
        };
      }
    } else if (event.type === "content_block_delta") {
      const delta: any = (event as any).delta;
      const slot = blocks[event.index];
      if (delta?.type === "text_delta" && slot?.kind === "text") {
        slot.text += delta.text;
        text += delta.text;
        onEvent({ type: "text", delta: delta.text });
      } else if (delta?.type === "input_json_delta" && slot?.kind === "tool_use") {
        slot.jsonBuf += delta.partial_json ?? "";
      }
    } else if (event.type === "message_delta") {
      const reason = (event as any).delta?.stop_reason as string | null;
      if (reason) stopReason = mapStopReason(reason);
      // Cumulative output token count for the message so far.
      const usageOut = (event as any).usage?.output_tokens;
      if (typeof usageOut === "number") outputTokens = usageOut;
    }
  }

  const toolCalls: LlmToolCall[] = [];
  for (const b of blocks) {
    if (b?.kind === "tool_use") {
      let input: Record<string, any> = {};
      if (b.jsonBuf.length > 0) {
        try {
          input = JSON.parse(b.jsonBuf);
        } catch {
          input = { _raw: b.jsonBuf };
        }
      }
      const tc: LlmToolCall = { id: b.id, name: b.name, input };
      toolCalls.push(tc);
      onEvent({ type: "tool_start", toolCall: tc });
    }
  }

  return {
    text,
    toolCalls,
    stopReason,
    usage: { inputTokens, outputTokens },
  };
}

// Normalize Anthropic's usage block to our shape. Cache tokens count as input.
function anthropicUsage(usage: any): { inputTokens: number; outputTokens: number } | undefined {
  if (!usage) return undefined;
  const input =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  return { inputTokens: input, outputTokens: usage.output_tokens ?? 0 };
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
