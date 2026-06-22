/**
 * Telegram streaming reply: shows the "typing…" status while the agent thinks
 * and live-streams partial output via sendMessageDraft (Bot API 9.3+), then
 * commits the finished text as a real message. Draft updates are throttled and
 * fire-and-forget so a slow or failed update never stalls or breaks the turn.
 */
import type { AgentEvent } from "@/agent/run";
import type { ReplyStream } from "@/channels/interface";
import { clearMessageDraft, sendChatAction, sendMessage, sendMessageDraft } from "./api";

// Telegram's typing status lasts ~5s; refresh it a touch sooner so it never lapses.
const TYPING_REFRESH_MS = 4000;
// Coalesce token deltas into at most one draft update per interval.
const DRAFT_THROTTLE_MS = 700;

export class TelegramReplyStream implements ReplyStream {
  private text = "";
  private sentDraft = "";
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private finished = false;

  constructor(
    private readonly token: string,
    private readonly chatId: number | string
  ) {}

  /** Show the typing indicator immediately and keep it alive until finish(). */
  async start() {
    await this.typing();
    this.typingTimer = setInterval(() => void this.typing(), TYPING_REFRESH_MS);
  }

  onEvent(event: AgentEvent) {
    if (this.finished) return;
    if (event.type === "text") {
      this.text += event.delta;
      this.scheduleDraft();
    }
    // tool_start / tool_end: the typing indicator (refreshed on its own timer)
    // already signals "still working", so there's nothing extra to stream.
  }

  async finish(assistantText: string) {
    this.finished = true;
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    if (this.typingTimer) {
      clearInterval(this.typingTimer);
      this.typingTimer = null;
    }
    // Commit the real message, then clear the streaming draft. Guard against an
    // empty turn so we never replace a live "typing…" with silence. Clearing is
    // best-effort: a failed clear leaves a stale draft, never a missing reply.
    await sendMessage(this.token, this.chatId, assistantText.trim() || "(no response)");
    await clearMessageDraft(this.token, this.chatId).catch((err) =>
      console.error("[telegram] clearMessageDraft failed", err)
    );
  }

  private typing() {
    return sendChatAction(this.token, this.chatId).catch((err) =>
      console.error("[telegram] sendChatAction failed", err)
    );
  }

  /** Trailing-throttle draft updates: at most one pending timer at a time. */
  private scheduleDraft() {
    if (this.draftTimer) return;
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null;
      void this.flushDraft();
    }, DRAFT_THROTTLE_MS);
  }

  private async flushDraft() {
    if (this.finished) return;
    const next = this.text;
    if (!next || next === this.sentDraft) return;
    this.sentDraft = next;
    try {
      await sendMessageDraft(this.token, this.chatId, next);
    } catch (err) {
      console.error("[telegram] sendMessageDraft failed", err);
    }
  }
}
