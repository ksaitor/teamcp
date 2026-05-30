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

export interface LlmCompletionResponse {
  text: string;
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
}

export interface LlmClient {
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  testConnection(): Promise<boolean>;
  // Optional: agent-loop turn with tools. Implemented by providers that support
  // native tool calling (Anthropic today); others throw.
  agentTurn?(req: LlmAgentRequest): Promise<LlmAgentResponse>;
}
