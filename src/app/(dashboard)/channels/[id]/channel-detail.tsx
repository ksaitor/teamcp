"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Channel {
  id: string;
  name: string;
  type: string;
  status: string;
  modelOverride: string | null;
  defaultLlmProviderId: string | null;
  webhookSecret: string;
  hasCredentials: boolean;
  config: Record<string, unknown>;
}

interface Identity {
  id: string;
  externalId: string;
  displayName: string | null;
  memberEmail: string;
  memberName: string | null;
  linkedAt: string;
}

interface ConversationListItem {
  id: string;
  title: string | null;
  memberEmail: string;
  updatedAt: string;
  messageCount: number;
}

export function ChannelDetail({
  channel,
  identities,
  conversations,
}: {
  channel: Channel;
  identities: Identity[];
  conversations: ConversationListItem[];
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const webhookUrl = useMemo(
    () => (origin ? `${origin}/api/channels/${channel.id}/webhook` : ""),
    [origin, channel.id]
  );

  const deliveryMode =
    channel.type === "TELEGRAM"
      ? (channel.config.deliveryMode as string) === "webhook"
        ? "webhook"
        : "polling"
      : null;

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch(`/api/channels/${channel.id}/test`, { method: "POST" });
    setTesting(false);
    const data = await res.json().catch(() => ({}));
    setTestResult(data.ok ? "ok" : "fail");
  }

  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function generateLinkCode() {
    setLinkLoading(true);
    setLinkError(null);
    const res = await fetch(`/api/channels/${channel.id}/link-codes`, {
      method: "POST",
    });
    setLinkLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLinkError(typeof data.error === "string" ? data.error : "Failed");
      return;
    }
    const data = await res.json();
    setLinkCode(data.code);
  }

  const [deleting, setDeleting] = useState(false);
  async function deleteChannel() {
    if (!confirm("Delete this channel? Identities and conversations will be removed.")) return;
    setDeleting(true);
    await fetch(`/api/channels/${channel.id}`, { method: "DELETE" });
    setDeleting(false);
    router.push("/channels");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {channel.type !== "WEB" && (
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Connection</h2>
            <div className="flex items-center gap-3">
              {testResult === "ok" && (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  Connected
                </span>
              )}
              {testResult === "fail" && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  Failed
                </span>
              )}
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {testing ? "Testing…" : "Test connection"}
              </button>
            </div>
          </div>

          {deliveryMode === "polling" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Delivery mode: <span className="font-medium">long-polling</span>.
              This bot receives messages through the standalone TeamRouter bot
              worker (<code className="font-mono">bun run bot:telegram</code>) —
              no public URL required.
            </p>
          ) : (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Delivery mode: <span className="font-medium">webhook</span>. We
                register this URL automatically and verify each inbound request
                with the channel's webhook secret.
              </p>
              <div className="mt-3 space-y-2">
                <CopyableValue label="URL" value={webhookUrl} />
                <CopyableValue label="Secret" value={channel.webhookSecret} mono />
              </div>
            </>
          )}
        </div>
      )}

      {channel.type !== "WEB" && (
        <div className="rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold">Link your account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate a one-time code (valid 15 min), DM the bot with it, and
            this account will be linked to your TeamRouter membership.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={generateLinkCode}
              disabled={linkLoading}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {linkLoading ? "Generating…" : "Generate code"}
            </button>
            {linkCode && (
              <code className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm">
                {linkCode}
              </code>
            )}
          </div>
          {linkError && (
            <p className="mt-2 text-xs text-destructive">{linkError}</p>
          )}
        </div>
      )}

      {channel.type === "WEB" && (
        <div className="rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold">Try it</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Web channels have no external setup. Open the chat to talk to the
            assistant with your permitted tools.
          </p>
          <Link
            href={`/chat?channelId=${channel.id}`}
            className="mt-3 inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open chat
          </Link>
        </div>
      )}

      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">Linked identities</h2>
        {identities.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No identities linked yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Member</th>
                <th className="pb-2 font-medium">External id</th>
                <th className="pb-2 font-medium">Linked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {identities.map((i) => (
                <tr key={i.id}>
                  <td className="py-2">
                    {i.memberName || i.memberEmail}
                    <span className="block text-xs text-muted-foreground">
                      {i.memberEmail}
                    </span>
                  </td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">
                    {i.externalId}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {new Date(i.linkedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">Recent conversations</h2>
        {conversations.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Title</th>
                <th className="pb-2 font-medium">Member</th>
                <th className="pb-2 font-medium">Messages</th>
                <th className="pb-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conversations.map((c) => (
                <tr key={c.id}>
                  <td className="py-2">
                    <Link
                      href={`/channels/${channel.id}/conversations/${c.id}`}
                      className="hover:underline"
                    >
                      {c.title || "(untitled)"}
                    </Link>
                  </td>
                  <td className="py-2 text-muted-foreground">{c.memberEmail}</td>
                  <td className="py-2 text-muted-foreground">{c.messageCount}</td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {new Date(c.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-md border border-destructive/30 bg-card p-4">
        <h2 className="font-semibold">Danger zone</h2>
        <button
          type="button"
          onClick={deleteChannel}
          disabled={deleting}
          className="mt-2 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete channel"}
        </button>
      </div>
    </div>
  );
}

function CopyableValue({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code
          className={`flex-1 rounded-md bg-muted px-3 py-1.5 text-xs ${mono ? "font-mono" : ""}`}
        >
          {value || "—"}
        </code>
        <button
          type="button"
          onClick={async () => {
            if (!value) return;
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
