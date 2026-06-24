export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionRequest {
  model: string;
  messages: LlmMessage[];
  maxTokens?: number;
  system?: string;
}

// Approximate token usage reported by the provider's response metadata.
// We surface whatever the provider returns and never re-tokenize ourselves.
export interface LlmTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompletionResponse {
  text: string;
  usage?: LlmTokenUsage;
}

// ─── Tool-use (agent loop) ──────────────────────────────────────────

export interface LlmTool {
  name: string;
  description?: string;
  inputSchema: Record<string, any>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export type LlmTurnMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string; isError?: boolean };

export interface LlmAgentRequest {
  model: string;
  system?: string;
  messages: LlmTurnMessage[];
  tools: LlmTool[];
  maxTokens?: number;
}

export interface LlmAgentResponse {
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
  usage?: LlmTokenUsage;
}

export type LlmStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; toolCall: LlmToolCall };

export interface LlmClient {
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  /**
   * Verify the credentials work. `model` is the provider's configured default —
   * providers that ping a model endpoint (e.g. Anthropic) should use it so the
   * test reflects the model the org will actually call.
   */
  testConnection(model?: string): Promise<boolean>;
  // Optional: agent-loop turn with tools. Implemented by providers that support
  // native tool calling (Anthropic today); others throw.
  agentTurn?(req: LlmAgentRequest): Promise<LlmAgentResponse>;
  // Optional: streaming variant — invokes onEvent for each text delta and
  // tool-call start, then resolves with the assembled response.
  agentTurnStream?(
    req: LlmAgentRequest,
    onEvent: (e: LlmStreamEvent) => void
  ): Promise<LlmAgentResponse>;
}
