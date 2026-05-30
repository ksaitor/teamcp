"use client";

import { useEffect, useRef, useState } from "react";
import { FiArrowUp, FiPlus, FiGlobe, FiMic, FiEdit, FiUser, FiEye } from "react-icons/fi";

interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
  toolCalls?: number;
}

export interface InitialMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SampleableMember {
  id: string;
  name: string;
  jobTitle: string | null;
}

const SELF = "__self__";

export function ChatUI({
  channelId,
  initialConversationId,
  initialMessages,
  sampleableMembers = [],
}: {
  channelId: string;
  channelName: string;
  initialConversationId?: string;
  initialMessages?: InitialMessage[];
  sampleableMembers?: SampleableMember[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => initialMessages?.map((m) => ({ role: m.role, content: m.content })) ?? []
  );
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId
  );
  const [loading, setLoading] = useState(false);
  const [actAsId, setActAsId] = useState<string>(SELF);
  const canSample = sampleableMembers.length > 0;
  const sampling = actAsId !== SELF;
  const actingAs = sampleableMembers.find((m) => m.id === actAsId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  function newChat() {
    setMessages([]);
    setConversationId(undefined);
    setInput("");
    textareaRef.current?.focus();
    // Drop ?conversationId / hydrate flags from the URL so a reload stays fresh.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("conversationId");
      url.searchParams.set("new", "1");
      window.history.replaceState(null, "", url.toString());
    }
  }

  // Switching identity wipes the visible transcript — the persisted convo
  // belongs to the caller and the sampled session has no DB row at all, so
  // mixing them would be misleading.
  function changeActAs(next: string) {
    if (next === actAsId) return;
    setActAsId(next);
    setMessages([]);
    setConversationId(undefined);
    setInput("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("conversationId");
      url.searchParams.set("new", "1");
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const priorTranscript = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = sampling
        ? await fetch(`/api/chat/sample`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId,
              actAsMembershipId: actAsId,
              text,
              history: priorTranscript,
            }),
          })
        : await fetch(`/api/channels/web/${channelId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, conversationId }),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data.error === "string" ? data.error : "Request failed";
        setMessages((m) => [...m, { role: "error", content: msg }]);
        return;
      }

      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.assistantText || "(no response)",
          toolCalls: data.toolCalls,
        },
      ]);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { role: "error", content: err.message || "Network error" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const canSend = !!input.trim() && !loading;
  const hasContent = messages.length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-4 py-2">
        <button
          type="button"
          onClick={newChat}
          disabled={!hasContent && !conversationId}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          title="Start a new chat"
        >
          <FiEdit className="h-4 w-4" />
          New chat
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 && !loading ? (
            <div className="flex h-full min-h-[40vh] items-center justify-center">
              <p className="text-center text-sm text-muted-foreground">
                Ask the assistant anything. It can call only the tools you've
                been granted access to.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => (
                <Bubble key={i} message={m} />
              ))}
              {loading && (
                <div className="text-sm text-muted-foreground">Thinking…</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        <div
          className={`rounded-3xl border bg-card shadow-sm transition focus-within:border-ring ${
            sampling ? "border-warning/60" : "border-border"
          }`}
        >
          {sampling && actingAs ? (
            <div className="flex items-center gap-2 rounded-t-3xl bg-warning/10 px-5 py-2 text-xs text-warning">
              <FiEye className="h-3.5 w-3.5" />
              <span>
                Sampling as <span className="font-medium">{actingAs.name}</span>
                {actingAs.jobTitle ? ` · ${actingAs.jobTitle}` : ""}. This
                conversation is not saved.
              </span>
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder={
              sampling && actingAs
                ? `Ask anything as ${actingAs.name}`
                : "Ask anything"
            }
            className="block w-full resize-none bg-transparent px-5 pt-4 pb-2 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-1">
              <ToolbarButton title="Attach" disabled>
                <FiPlus className="h-5 w-5" />
              </ToolbarButton>
              <ToolbarButton title="Tools" disabled>
                <FiGlobe className="h-5 w-5" />
              </ToolbarButton>
              {canSample ? (
                <ActAsSelector
                  value={actAsId}
                  members={sampleableMembers}
                  onChange={changeActAs}
                  disabled={loading}
                />
              ) : (
                <span className="ml-1 text-sm text-muted-foreground">Auto</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <ToolbarButton title="Voice" disabled>
                <FiMic className="h-5 w-5" />
              </ToolbarButton>
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                aria-label="Send"
                className={`ml-1 flex h-9 w-9 items-center justify-center rounded-full transition ${
                  canSend
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <FiArrowUp className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

function ActAsSelector({
  value,
  members,
  onChange,
  disabled,
}: {
  value: string;
  members: SampleableMember[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const active = value === SELF ? null : members.find((m) => m.id === value);
  return (
    <label
      className={`ml-1 flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition ${
        active
          ? "bg-warning/10 text-warning hover:bg-warning/20"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      title="Sample the assistant as another member"
    >
      {active ? <FiEye className="h-4 w-4" /> : <FiUser className="h-4 w-4" />}
      <span className="max-w-[140px] truncate">
        {active ? `As ${active.name}` : "You"}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="sr-only"
        aria-label="Act as member"
      >
        <option value={SELF}>You (yourself)</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.jobTitle ? ` — ${m.jobTitle}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToolbarButton({
  children,
  title,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl bg-muted px-4 py-2.5 text-sm">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === "error") {
    return (
      <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {message.content}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="whitespace-pre-wrap text-sm">{message.content}</div>
      {message.toolCalls ? (
        <p className="text-xs text-muted-foreground">
          {message.toolCalls} tool call{message.toolCalls === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
