import { prisma } from "@/db";
import { getChannelLlmClient } from "@/ai/providers/resolve";
import { buildToolListForMember } from "@/server/tool-builder";
import { executeToolForMember } from "@/server/execute";
import type { AuthenticatedMember } from "@/server/auth";
import { touchLastActive } from "@/lib/activity";
import type {
  LlmAgentResponse,
  LlmTool,
  LlmTurnMessage,
} from "@/ai/providers/types";

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string; id: string }
  | { type: "tool_end"; name: string; id: string; isError: boolean }
  | { type: "done"; assistantText: string; toolCalls: number; conversationId?: string };
import type { Channel, Conversation } from "@prisma/client";

const MAX_TOOL_ITERATIONS = 8;
const HISTORY_LIMIT = 40;

export interface AgentTurnResult {
  assistantText: string;
  toolCalls: number;
}

export interface RunAgentTurnInput {
  member: AuthenticatedMember;
  channel: Channel;
  conversation: Conversation;
  userMessage: string;
}

export interface EphemeralTurnMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunAgentTurnEphemeralInput {
  member: AuthenticatedMember;
  channel: Channel;
  history: EphemeralTurnMessage[];
  userMessage: string;
}

/**
 * Stateless variant of {@link runAgentTurn}: takes the prior transcript in
 * memory, runs one user → assistant exchange, and persists nothing. Used by
 * the admin "sample as member" mode in /chat so that simulated sessions
 * never touch the conversation/message tables.
 */
export async function runAgentTurnEphemeral(
  input: RunAgentTurnEphemeralInput
): Promise<AgentTurnResult> {
  const { member, channel, history, userMessage } = input;

  const llm = await getChannelLlmClient(channel);
  if (!llm || typeof llm.client.agentTurn !== "function") {
    throw new Error(
      "No LLM client supporting tool_use is configured for this organization."
    );
  }

  const mcpTools = await buildToolListForMember(member.id, member.organizationId);
  const tools: LlmTool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: (t.inputSchema as Record<string, any>) ?? {
      type: "object",
      properties: {},
    },
  }));

  const messages: LlmTurnMessage[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as LlmTurnMessage),
    { role: "user", content: userMessage },
  ];

  const system = buildSystemPrompt(member);
  let assistantText = "";
  let toolCallCount = 0;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const response = await llm.client.agentTurn({
      model: llm.model,
      system,
      tools,
      messages,
    });
    assistantText = response.text;

    if (response.toolCalls.length === 0 || response.stopReason !== "tool_use") {
      messages.push({ role: "assistant", content: response.text });
      break;
    }

    messages.push({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      toolCallCount++;
      const toolResult = await executeToolForMember(call.name, call.input, member);
      const text = toolResult.content?.[0]?.text ?? "";
      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: text,
        isError: toolResult.isError,
      });
    }
  }

  return { assistantText, toolCalls: toolCallCount };
}

/**
 * Run one user-message → assistant-message exchange on a channel, looping
 * through tool_use cycles. Reuses the existing permission + AI filter +
 * approval pipeline via `executeToolForMember`, so MCP and Channels enforce
 * identical authorization.
 */
export async function runAgentTurn(
  input: RunAgentTurnInput
): Promise<AgentTurnResult> {
  const { member, channel, conversation, userMessage } = input;

  // A real (non-simulated) chat turn counts as member activity.
  touchLastActive(member.id);

  const llm = await getChannelLlmClient(channel);
  if (!llm || typeof llm.client.agentTurn !== "function") {
    throw new Error(
      "No LLM client supporting tool_use is configured for this organization."
    );
  }

  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId: member.organizationId },
  });
  const persistBodies = settings?.channelPersistMessageBodies !== false;

  const mcpTools = await buildToolListForMember(member.id, member.organizationId);
  const tools: LlmTool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: (t.inputSchema as Record<string, any>) ?? {
      type: "object",
      properties: {},
    },
  }));

  const history = await loadHistory(conversation.id);
  const messages: LlmTurnMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  await persistMessage(conversation.id, {
    role: "USER",
    content: persistBodies ? userMessage : null,
  });

  const system = buildSystemPrompt(member);

  let assistantText = "";
  let toolCallCount = 0;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const response = await llm.client.agentTurn({
      model: llm.model,
      system,
      tools,
      messages,
    });

    assistantText = response.text;

    await persistMessage(conversation.id, {
      role: "ASSISTANT",
      content: persistBodies ? response.text : null,
      toolCalls:
        response.toolCalls.length > 0
          ? (persistBodies ? response.toolCalls : response.toolCalls.map((c) => ({ id: c.id, name: c.name })))
          : null,
    });

    if (response.toolCalls.length === 0 || response.stopReason !== "tool_use") {
      messages.push({ role: "assistant", content: response.text });
      break;
    }

    messages.push({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      toolCallCount++;
      const toolResult = await executeToolForMember(call.name, call.input, member);
      const text = toolResult.content?.[0]?.text ?? "";

      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: text,
        isError: toolResult.isError,
      });

      await persistMessage(conversation.id, {
        role: "TOOL",
        content: persistBodies ? text : null,
        toolName: call.name,
      });
    }
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  return { assistantText, toolCalls: toolCallCount };
}

/** Streaming variant of {@link runAgentTurnEphemeral}. */
export async function runAgentTurnEphemeralStream(
  input: RunAgentTurnEphemeralInput,
  onEvent: (e: AgentEvent) => void
): Promise<AgentTurnResult> {
  const { member, channel, history, userMessage } = input;

  const llm = await getChannelLlmClient(channel);
  if (!llm || typeof llm.client.agentTurn !== "function") {
    throw new Error(
      "No LLM client supporting tool_use is configured for this organization."
    );
  }

  const mcpTools = await buildToolListForMember(member.id, member.organizationId);
  const tools: LlmTool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: (t.inputSchema as Record<string, any>) ?? {
      type: "object",
      properties: {},
    },
  }));

  const messages: LlmTurnMessage[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as LlmTurnMessage),
    { role: "user", content: userMessage },
  ];

  const system = buildSystemPrompt(member);
  let assistantText = "";
  let toolCallCount = 0;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const response = await runOneTurnWithStream(llm.client, {
      model: llm.model,
      system,
      tools,
      messages,
    }, onEvent);
    assistantText = response.text;

    if (response.toolCalls.length === 0 || response.stopReason !== "tool_use") {
      messages.push({ role: "assistant", content: response.text });
      break;
    }

    messages.push({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      toolCallCount++;
      const toolResult = await executeToolForMember(call.name, call.input, member);
      const text = toolResult.content?.[0]?.text ?? "";
      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: text,
        isError: toolResult.isError,
      });
      onEvent({
        type: "tool_end",
        name: call.name,
        id: call.id,
        isError: !!toolResult.isError,
      });
    }
  }

  return { assistantText, toolCalls: toolCallCount };
}

/** Streaming variant of {@link runAgentTurn}. */
export async function runAgentTurnStream(
  input: RunAgentTurnInput,
  onEvent: (e: AgentEvent) => void
): Promise<AgentTurnResult> {
  const { member, channel, conversation, userMessage } = input;

  // A real (non-simulated) chat turn counts as member activity.
  touchLastActive(member.id);

  const llm = await getChannelLlmClient(channel);
  if (!llm || typeof llm.client.agentTurn !== "function") {
    throw new Error(
      "No LLM client supporting tool_use is configured for this organization."
    );
  }

  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId: member.organizationId },
  });
  const persistBodies = settings?.channelPersistMessageBodies !== false;

  const mcpTools = await buildToolListForMember(member.id, member.organizationId);
  const tools: LlmTool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: (t.inputSchema as Record<string, any>) ?? {
      type: "object",
      properties: {},
    },
  }));

  const history = await loadHistory(conversation.id);
  const messages: LlmTurnMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  await persistMessage(conversation.id, {
    role: "USER",
    content: persistBodies ? userMessage : null,
  });

  const system = buildSystemPrompt(member);
  let assistantText = "";
  let toolCallCount = 0;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const response = await runOneTurnWithStream(llm.client, {
      model: llm.model,
      system,
      tools,
      messages,
    }, onEvent);
    assistantText = response.text;

    await persistMessage(conversation.id, {
      role: "ASSISTANT",
      content: persistBodies ? response.text : null,
      toolCalls:
        response.toolCalls.length > 0
          ? (persistBodies ? response.toolCalls : response.toolCalls.map((c) => ({ id: c.id, name: c.name })))
          : null,
    });

    if (response.toolCalls.length === 0 || response.stopReason !== "tool_use") {
      messages.push({ role: "assistant", content: response.text });
      break;
    }

    messages.push({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      toolCallCount++;
      const toolResult = await executeToolForMember(call.name, call.input, member);
      const text = toolResult.content?.[0]?.text ?? "";

      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: text,
        isError: toolResult.isError,
      });

      await persistMessage(conversation.id, {
        role: "TOOL",
        content: persistBodies ? text : null,
        toolName: call.name,
      });

      onEvent({
        type: "tool_end",
        name: call.name,
        id: call.id,
        isError: !!toolResult.isError,
      });
    }
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  return { assistantText, toolCalls: toolCallCount };
}

async function runOneTurnWithStream(
  client: { agentTurn?: Function; agentTurnStream?: Function },
  req: {
    model: string;
    system: string;
    tools: LlmTool[];
    messages: LlmTurnMessage[];
  },
  onEvent: (e: AgentEvent) => void
): Promise<LlmAgentResponse> {
  if (typeof client.agentTurnStream === "function") {
    return (client as any).agentTurnStream(req, (e: any) => {
      if (e.type === "text") onEvent({ type: "text", delta: e.delta });
      else if (e.type === "tool_start") {
        onEvent({
          type: "tool_start",
          name: e.toolCall.name,
          id: e.toolCall.id,
        });
      }
    });
  }
  // Fall back to non-streaming, then emit one text chunk + tool_start events.
  const resp = await (client as any).agentTurn(req);
  if (resp.text) onEvent({ type: "text", delta: resp.text });
  for (const tc of resp.toolCalls ?? []) {
    onEvent({ type: "tool_start", name: tc.name, id: tc.id });
  }
  return resp;
}

async function loadHistory(conversationId: string): Promise<LlmTurnMessage[]> {
  // Per-user scoping: a Conversation row is owned by exactly one OrgMembership
  // (enforced at creation in the web/webhook routes), and we never read
  // messages from any other conversation. The model only ever sees the
  // caller's own previous turns — never another member's history.
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
  });

  // History is a high-level transcript only: user + final assistant text.
  // Tool calls and tool results from previous turns are intentionally dropped
  // so we never send dangling tool_use / tool_result blocks to the model.
  const out: LlmTurnMessage[] = [];
  for (const m of rows) {
    if (m.role === "USER" && m.content) {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "ASSISTANT" && m.content) {
      out.push({ role: "assistant", content: m.content });
    }
  }
  return out;
}

async function persistMessage(
  conversationId: string,
  data: {
    role: "USER" | "ASSISTANT" | "TOOL";
    content: string | null;
    toolCalls?: unknown;
    toolName?: string;
  }
) {
  await prisma.message.create({
    data: {
      conversationId,
      role: data.role,
      content: data.content,
      toolCalls: (data.toolCalls as any) ?? null,
      toolName: data.toolName ?? null,
    },
  });
}

function buildSystemPrompt(member: AuthenticatedMember): string {
  const parts = [
    `You are an assistant for ${member.name || member.email}, an employee at their organization on TeamCP.`,
    `You can call the tools listed for this user — they are scoped to what the organization owner has permitted.`,
    `If a tool call is denied, queued for admin approval, or returns an error, explain it plainly to the user.`,
  ];
  if (member.jobTitle) parts.push(`The user's role is: ${member.jobTitle}.`);
  if (member.permissionInstructions) {
    parts.push(`Permission guidance from the organization: ${member.permissionInstructions}`);
  }
  return parts.join("\n");
}
