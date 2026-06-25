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
    return { text, usage: openAiUsage(data?.usage) };
  }

  async agentTurn(req: LlmAgentRequest): Promise<LlmAgentResponse> {
    const messages = toOpenAiMessages(req.system, req.messages);
    const tools = req.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        parameters: (t.inputSchema as Record<string, any>) ?? {
          type: "object",
          properties: {},
        },
      },
    }));

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 500)}`);
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const message = choice?.message;
    if (!message) {
      throw new Error("LLM response missing choices[0].message");
    }

    const text = typeof message.content === "string" ? message.content : "";
    const toolCalls: LlmToolCall[] = [];
    for (const tc of message.tool_calls ?? []) {
      if (tc?.type !== "function" || !tc.function) continue;
      let input: Record<string, any> = {};
      const args = tc.function.arguments;
      if (typeof args === "string" && args.length > 0) {
        try {
          input = JSON.parse(args);
        } catch {
          input = { _raw: args };
        }
      } else if (args && typeof args === "object") {
        input = args as Record<string, any>;
      }
      toolCalls.push({ id: tc.id, name: tc.function.name, input });
    }

    return {
      text,
      toolCalls,
      stopReason: mapStopReason(choice?.finish_reason, toolCalls.length > 0),
      usage: openAiUsage(data?.usage),
    };
  }

  async agentTurnStream(
    req: LlmAgentRequest,
    onEvent: (e: LlmStreamEvent) => void
  ): Promise<LlmAgentResponse> {
    const messages = toOpenAiMessages(req.system, req.messages);
    const tools = req.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        parameters: (t.inputSchema as Record<string, any>) ?? {
          type: "object",
          properties: {},
        },
      },
    }));

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        messages,
        stream: true,
        // Ask for a trailing usage chunk (OpenAI/most compatibles support this);
        // providers that ignore it simply leave usage undefined.
        stream_options: { include_usage: true },
        ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 500)}`);
    }

    let text = "";
    let finishReason: string | null = null;
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    type PartialToolCall = {
      id: string;
      name: string;
      argsBuf: string;
      announced: boolean;
    };
    const toolByIndex = new Map<number, PartialToolCall>();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const rawLine = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!rawLine.startsWith("data:")) continue;
        const payload = rawLine.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        // The trailing usage chunk carries `usage` with an empty choices array,
        // so read it before the choice guard below.
        if (chunk?.usage) usage = openAiUsage(chunk.usage);

        const choice = chunk?.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta;
        if (delta?.content) {
          text += delta.content;
          onEvent({ type: "text", delta: delta.content });
        }
        for (const tcDelta of delta?.tool_calls ?? []) {
          const i = tcDelta.index ?? 0;
          let slot = toolByIndex.get(i);
          if (!slot) {
            slot = { id: "", name: "", argsBuf: "", announced: false };
            toolByIndex.set(i, slot);
          }
          if (tcDelta.id) slot.id = tcDelta.id;
          const fn = tcDelta.function;
          if (fn?.name) slot.name += fn.name;
          if (fn?.arguments) slot.argsBuf += fn.arguments;
        }
      }
    }

    const toolCalls: LlmToolCall[] = [];
    for (const [, slot] of [...toolByIndex.entries()].sort((a, b) => a[0] - b[0])) {
      if (!slot.name) continue;
      let input: Record<string, any> = {};
      if (slot.argsBuf.length > 0) {
        try {
          input = JSON.parse(slot.argsBuf);
        } catch {
          input = { _raw: slot.argsBuf };
        }
      }
      const tc: LlmToolCall = {
        id: slot.id || `call_${toolCalls.length}`,
        name: slot.name,
        input,
      };
      toolCalls.push(tc);
      onEvent({ type: "tool_start", toolCall: tc });
    }

    return {
      text,
      toolCalls,
      stopReason: mapStopReason(finishReason, toolCalls.length > 0),
      usage,
    };
  }

  async testConnection(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.headers(),
    });
    return res.ok;
  }
}

function toOpenAiMessages(
  system: string | undefined,
  messages: LlmTurnMessage[]
) {
  const out: Array<Record<string, any>> = [];
  if (system) out.push({ role: "system", content: system });

  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const msg: Record<string, any> = {
        role: "assistant",
        content: m.content || "",
      };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input ?? {}),
          },
        }));
      }
      out.push(msg);
    } else {
      // tool result
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      });
    }
  }
  return out;
}

// Normalize an OpenAI-style usage block to our shape.
function openAiUsage(
  usage: any
): { inputTokens: number; outputTokens: number } | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
  };
}

function mapStopReason(
  reason: string | null | undefined,
  hasToolCalls: boolean
): LlmAgentResponse["stopReason"] {
  if (reason === "tool_calls" || (hasToolCalls && reason === "stop"))
    return "tool_use";
  if (reason === "stop") return "end_turn";
  if (reason === "length") return "max_tokens";
  return "other";
}
