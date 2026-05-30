"use client";

import { useEffect, useRef, useState } from "react";
import {
  FiArrowUp,
  FiPlus,
  FiMic,
  FiEdit,
  FiUser,
  FiEye,
  FiChevronDown,
  FiCheck,
} from "react-icons/fi";

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
  email: string;
  image: string | null;
  jobTitle: string | null;
}

export interface SelfMember {
  name: string | null;
  email: string;
  image: string | null;
}

const SELF = "__self__";

export function ChatUI({
  channelId,
  initialConversationId,
  initialMessages,
  sampleableMembers = [],
  self,
}: {
  channelId: string;
  channelName: string;
  initialConversationId?: string;
  initialMessages?: InitialMessage[];
  sampleableMembers?: SampleableMember[];
  self: SelfMember;
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
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("conversationId");
      url.searchParams.set("new", "1");
      window.history.replaceState(null, "", url.toString());
    }
  }

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

    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "", toolCalls: 0 },
    ]);
    setInput("");
    setLoading(true);

    const updateAssistant = (mut: (msg: ChatMessage) => ChatMessage) =>
      setMessages((m) => {
        const out = [...m];
        for (let i = out.length - 1; i >= 0; i--) {
          if (out[i].role === "assistant") {
            out[i] = mut(out[i]);
            break;
          }
        }
        return out;
      });

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

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data.error === "string" ? data.error : "Request failed";
        setMessages((m) => {
          const out = m.filter(
            (x, i) => !(x.role === "assistant" && x.content === "" && i === m.length - 1)
          );
          return [...out, { role: "error", content: msg }];
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let toolCount = 0;
      let gotConversationId: string | undefined;
      let gotAssistant = "";
      let gotError: string | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "text") {
            gotAssistant += event.delta;
            updateAssistant((msg) => ({
              ...msg,
              content: msg.content + event.delta,
            }));
          } else if (event.type === "tool_start") {
            toolCount++;
            updateAssistant((msg) => ({
              ...msg,
              toolCalls: (msg.toolCalls ?? 0) + 1,
            }));
          } else if (event.type === "done") {
            if (event.conversationId) gotConversationId = event.conversationId;
            if (event.assistantText && !gotAssistant) {
              updateAssistant((msg) => ({ ...msg, content: event.assistantText }));
            }
          } else if (event.type === "error") {
            gotError = event.error;
          }
        }
      }

      if (gotConversationId) setConversationId(gotConversationId);
      if (gotError) {
        setMessages((m) => [...m, { role: "error", content: gotError! }]);
      } else if (!gotAssistant) {
        updateAssistant((msg) => ({ ...msg, content: "(no response)" }));
      }
      // toolCount already reflected in bubble via updateAssistant
      void toolCount;
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

  const currentDisplay = actingAs
    ? {
        name: actingAs.name,
        image: actingAs.image,
        secondary: actingAs.jobTitle || actingAs.email,
      }
    : {
        name: self.name || self.email,
        image: self.image,
        secondary: null,
      };

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
                <Bubble
                  key={i}
                  message={m}
                  pending={
                    loading &&
                    i === messages.length - 1 &&
                    m.role === "assistant" &&
                    m.content === ""
                  }
                />
              ))}
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
              <IdentityPill
                display={currentDisplay}
                sampling={sampling}
                canSample={canSample}
                value={actAsId}
                members={sampleableMembers}
                self={self}
                onChange={changeActAs}
                disabled={loading}
              />
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

function IdentityPill({
  display,
  sampling,
  canSample,
  value,
  members,
  self,
  onChange,
  disabled,
}: {
  display: { name: string; image: string | null; secondary: string | null };
  sampling: boolean;
  canSample: boolean;
  value: string;
  members: SampleableMember[];
  self: SelfMember;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative ml-1">
      <button
        type="button"
        onClick={() => canSample && setOpen((o) => !o)}
        disabled={disabled || !canSample}
        title={
          canSample
            ? "Switch which member you are chatting as"
            : "You are chatting as yourself"
        }
        className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-sm transition ${
          sampling
            ? "border-warning/60 text-warning hover:bg-warning/10"
            : "border-border text-foreground"
        } ${canSample ? "hover:bg-accent hover:text-accent-foreground cursor-pointer" : "cursor-default"} ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        <Avatar name={display.name} image={display.image} size={22} />
        <span className="max-w-[160px] truncate font-medium">
          {display.name}
        </span>
        {canSample && <FiChevronDown className="h-3.5 w-3.5 opacity-70" />}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            Chat as
          </div>
          <div className="max-h-72 overflow-y-auto">
            <IdentityOption
              selected={value === SELF}
              name={self.name || self.email}
              secondary="You (yourself)"
              image={self.image}
              onClick={() => {
                onChange(SELF);
                setOpen(false);
              }}
            />
            {members.length > 0 && (
              <div className="border-t border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Sample as member
              </div>
            )}
            {members.map((m) => (
              <IdentityOption
                key={m.id}
                selected={value === m.id}
                name={m.name}
                secondary={m.jobTitle || m.email}
                image={m.image}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IdentityOption({
  selected,
  name,
  secondary,
  image,
  onClick,
}: {
  selected: boolean;
  name: string;
  secondary: string | null;
  image: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
        selected ? "bg-accent/60" : ""
      }`}
    >
      <Avatar name={name} image={image} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{name}</span>
        {secondary && (
          <span className="block truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        )}
      </span>
      {selected && <FiCheck className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

function Avatar({
  name,
  image,
  size,
}: {
  name: string;
  image: string | null;
  size: number;
}) {
  const style = { width: size, height: size };
  if (image) {
    return (
      <img
        src={image}
        alt=""
        style={style}
        className="rounded-full object-cover"
      />
    );
  }
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      style={style}
      className="flex items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
    >
      {initial || <FiUser className="h-3 w-3" />}
    </span>
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

function Bubble({
  message,
  pending,
}: {
  message: ChatMessage;
  pending?: boolean;
}) {
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
  if (pending) {
    return (
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <span className="animate-pulse">Thinking</span>
        <span className="inline-flex gap-0.5">
          <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground" />
        </span>
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
