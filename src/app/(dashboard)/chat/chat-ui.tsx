"use client";

import { useEffect, useRef, useState } from "react";
import { FiArrowUp, FiPlus, FiGlobe, FiMic, FiEdit } from "react-icons/fi";

interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
  toolCalls?: number;
}

export interface InitialMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatUI({
  channelId,
  initialConversationId,
  initialMessages,
}: {
  channelId: string;
  channelName: string;
  initialConversationId?: string;
  initialMessages?: InitialMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => initialMessages?.map((m) => ({ role: m.role, content: m.content })) ?? []
  );
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId
  );
  const [loading, setLoading] = useState(false);
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

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/channels/web/${channelId}/messages`, {
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
        <div className="rounded-3xl border border-border bg-card shadow-sm transition focus-within:border-ring">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder="Ask anything"
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
              <span className="ml-1 text-sm text-muted-foreground">Auto</span>
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
