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

export interface LlmClient {
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  testConnection(): Promise<boolean>;
}
