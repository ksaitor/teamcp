"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_META } from "@/lib/channel-icons";

type ChannelType = "WEB" | "TELEGRAM" | "SLACK" | "WHATSAPP";

const TYPES: {
  value: ChannelType;
  label: string;
  description: string;
  ready: boolean;
  credentialLabel?: string;
  credentialHelp?: string;
}[] = [
  {
    value: "WEB",
    label: "Web chat",
    description:
      "Chat with the assistant inside this app. No external setup. Fastest way to validate everything works.",
    ready: true,
  },
  {
    value: "TELEGRAM",
    label: "Telegram bot",
    description:
      "Bring your own Telegram bot. Linked members chat with it as an AI agent using their permitted tools.",
    ready: true,
    credentialLabel: "Bot token",
    credentialHelp: "From @BotFather. We store it encrypted at rest.",
  },
  {
    value: "SLACK",
    label: "Slack app",
    description:
      "Bring your own Slack app. Linked members chat with it as an AI agent using their permitted tools. Uses Socket Mode — no public URL required.",
    ready: true,
    credentialLabel: "Bot token + app token + signing secret (JSON)",
    credentialHelp:
      'e.g. {"botToken":"xoxb-...","appToken":"xapp-...","signingSecret":"..."}. The app token (xapp-) drives Socket Mode; the signing secret is only needed for webhook delivery. Subscribe to the app_mention and message.im events. We store it encrypted at rest.',
  },
  {
    value: "WHATSAPP",
    label: "WhatsApp Cloud",
    description:
      "Bring your own WhatsApp Cloud API app. Configure the webhook URL in Meta Developer.",
    ready: false,
    credentialLabel: "App secret + access token (JSON)",
    credentialHelp:
      'e.g. {"appSecret":"...","accessToken":"...","phoneNumberId":"..."}',
  },
];

export function NewChannelForm({
  existingTypes = [],
}: {
  // Channel types that already exist for this org (one-per-type limit).
  existingTypes?: ChannelType[];
}) {
  const router = useRouter();
  const taken = new Set(existingTypes);
  // Default to the first type that isn't already taken so the form opens on a
  // selectable option.
  const firstAvailable = TYPES.find((t) => !taken.has(t.value))?.value ?? "WEB";
  const [type, setType] = useState<ChannelType>(firstAvailable);
  const [name, setName] = useState("Internal chat");
  const [credentials, setCredentials] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const chosen = TYPES.find((t) => t.value === type)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (taken.has(type)) {
      setError("A channel of this type already exists. Only one per type is allowed.");
      return;
    }
    setError(null);
    setLoading(true);

    const body: Record<string, unknown> = { name, type };
    if (type !== "WEB") body.credentials = credentials;

    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Failed to create channel");
      return;
    }

    const created = await res.json();
    router.push(`/channels/${created.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Type</h2>
        <div className="grid gap-2">
          {TYPES.map((t) => {
            const Icon = CHANNEL_META[t.value].icon;
            const isTaken = taken.has(t.value);
            return (
              <label
                key={t.value}
                className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
                  isTaken
                    ? "cursor-not-allowed border-border opacity-60"
                    : type === t.value
                      ? "cursor-pointer border-ring bg-accent"
                      : "cursor-pointer border-border hover:bg-accent/40"
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={t.value}
                  checked={type === t.value}
                  onChange={() => setType(t.value)}
                  disabled={isTaken}
                  className="mt-0.5"
                />
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    {t.label}
                    {isTaken && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Already added
                      </span>
                    )}
                    {!isTaken && !t.ready && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        coming soon
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={chosen.value === "WEB" ? "Internal chat" : "Acme Telegram bot"}
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>

        {chosen.credentialLabel && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              {chosen.credentialLabel}
            </label>
            <textarea
              value={credentials}
              onChange={(e) => setCredentials(e.target.value)}
              required={chosen.value !== "WEB"}
              rows={3}
              className="mt-1 w-full rounded-md border border-input px-3 py-1.5 font-mono text-xs focus:border-ring focus:outline-none"
            />
            {chosen.credentialHelp && (
              <p className="mt-1 text-xs text-muted-foreground">
                {chosen.credentialHelp}
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || taken.has(type)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create channel"}
        </button>
        {!chosen.ready && (
          <span className="text-xs text-muted-foreground">
            This channel type is in preview — inbound webhooks aren't wired up yet.
          </span>
        )}
      </div>
    </form>
  );
}
