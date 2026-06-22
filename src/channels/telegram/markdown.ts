/**
 * Convert the Markdown the agent emits into the small HTML subset Telegram's
 * `parse_mode: "HTML"` understands, so users see formatted text instead of raw
 * markup. Telegram supports only <b>/<i>/<u>/<s>/<a>/<code>/<pre>/<blockquote>
 * — there are no headers, lists, or tables — so unsupported blocks degrade
 * gracefully (headers → bold, bullets → "• ", rules → a divider line).
 *
 * https://core.telegram.org/bots/api#html-style
 */

// Telegram rejects messages longer than 4096 UTF-16 code units.
export const MAX_MESSAGE_LENGTH = 4096;

// Budget for a source chunk before conversion. HTML escaping/tagging expands
// text, so we leave generous headroom under the 4096 cap.
const SOURCE_CHUNK_BUDGET = 3000;

// Private-use sentinel that brackets code placeholders. It contains no HTML
// or Markdown specials, so it survives escaping and inline formatting intact.
const SENTINEL = "";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline formatting, applied to already-HTML-escaped text. */
function inline(s: string): string {
  return (
    s
      // Links: [text](url). url is already escaped (& → &amp;); guard quotes.
      .replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_m, t, url) => `<a href="${url.replace(/"/g, "%22")}">${t}</a>`
      )
      // Bold + italic, then bold, then italic, then strikethrough.
      .replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(?<!\w)__([^_]+)__(?!\w)/g, "<b>$1</b>")
      .replace(/\*([^*\n]+)\*/g, "<i>$1</i>")
      // Underscore italics only at word boundaries, so snake_case is untouched.
      .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<i>$1</i>")
      .replace(/~~([^~]+)~~/g, "<s>$1</s>")
  );
}

export function markdownToHtml(md: string): string {
  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];

  let text = md.replace(/\r\n/g, "\n");

  // 1. Pull out fenced code blocks first so nothing inside is reformatted.
  text = text.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_m, lang: string, body: string) => {
    const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
    codeBlocks.push(`<pre><code${cls}>${escapeHtml(body.replace(/\n$/, ""))}</code></pre>`);
    return `${SENTINEL}B${codeBlocks.length - 1}${SENTINEL}`;
  });

  // 2. Pull out inline code spans.
  text = text.replace(/`([^`\n]+)`/g, (_m, body: string) => {
    inlineCodes.push(`<code>${escapeHtml(body)}</code>`);
    return `${SENTINEL}I${inlineCodes.length - 1}${SENTINEL}`;
  });

  // 3. Escape everything else (placeholders carry no HTML specials).
  text = escapeHtml(text);

  // 4. Block-level pass, line by line.
  const out: string[] = [];
  let quote: string[] = [];
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${quote.join("\n")}</blockquote>`);
      quote = [];
    }
  };

  for (const raw of text.split("\n")) {
    // Horizontal rule (---, ***, ___).
    if (/^\s*([-*_])\1{2,}\s*$/.test(raw)) {
      flushQuote();
      out.push("──────────");
      continue;
    }
    // Blockquote — note `>` is already escaped to `&gt;`. Collect consecutive.
    const q = raw.match(/^\s*&gt;\s?(.*)$/);
    if (q) {
      quote.push(inline(q[1]));
      continue;
    }
    flushQuote();
    // Header → bold (Telegram has no headers).
    const h = raw.match(/^\s*#{1,6}\s+(.*?)\s*#*\s*$/);
    if (h) {
      out.push(`<b>${inline(h[1])}</b>`);
      continue;
    }
    // Bullet list → "• ", keeping leading indentation.
    const b = raw.match(/^(\s*)[-*+]\s+(.*)$/);
    if (b) {
      out.push(`${b[1]}• ${inline(b[2])}`);
      continue;
    }
    out.push(inline(raw));
  }
  flushQuote();
  text = out.join("\n");

  // 5. Restore the extracted code.
  text = text.replace(new RegExp(`${SENTINEL}B(\\d+)${SENTINEL}`, "g"), (_m, i) => codeBlocks[+i]);
  text = text.replace(new RegExp(`${SENTINEL}I(\\d+)${SENTINEL}`, "g"), (_m, i) => inlineCodes[+i]);

  return text;
}

/**
 * Split Markdown into pieces under the length budget at line boundaries,
 * never breaking inside a fenced code block. Each piece is self-contained, so
 * it converts to valid, balanced HTML on its own.
 */
export function chunkMarkdown(md: string): string[] {
  const lines = md.split("\n");
  const chunks: string[] = [];
  let cur: string[] = [];
  let curLen = 0;
  let inFence = false;

  const flush = () => {
    if (cur.length) {
      chunks.push(cur.join("\n"));
      cur = [];
      curLen = 0;
    }
  };

  for (const line of lines) {
    const isFence = /^\s*```/.test(line);
    if (!inFence && !isFence && cur.length && curLen + line.length + 1 > SOURCE_CHUNK_BUDGET) {
      flush();
    }
    if (isFence) inFence = !inFence;
    cur.push(line);
    curLen += line.length + 1;
  }
  flush();

  return chunks.length ? chunks : [md];
}

/**
 * Best-effort plain-text rendering of our Telegram HTML, used as a fallback
 * when Telegram rejects the formatted markup so a reply is never dropped.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<a href="([^"]*)">([^<]*)<\/a>/g, "$2 ($1)")
    .replace(/<\/?(b|i|u|s|code|pre|blockquote)[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
