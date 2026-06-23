"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Settings {
  id: string;
  aiFilterEnabled: boolean;
  aiModel: string;
  approvalTimeoutSecs: number;
  logRetentionDays: number;
  defaultSessionDurationHours: number;
  notifyEmail: boolean;
  notifyWebhookUrl: string | null;
  notifySlackWebhookUrl: string | null;
  channelPersistMessageBodies: boolean;
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    const formData = new FormData(e.currentTarget);

    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiFilterEnabled: formData.get("aiFilterEnabled") === "on",
        aiModel: formData.get("aiModel"),
        approvalTimeoutSecs: Number(formData.get("approvalTimeoutSecs")),
        logRetentionDays: Number(formData.get("logRetentionDays")),
        defaultSessionDurationHours: Number(formData.get("defaultSessionDurationHours")),
        notifyEmail: formData.get("notifyEmail") === "on",
        notifyWebhookUrl: formData.get("notifyWebhookUrl") || null,
        notifySlackWebhookUrl: formData.get("notifySlackWebhookUrl") || null,
        channelPersistMessageBodies: formData.get("channelPersistMessageBodies") === "on",
      }),
    });

    setLoading(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-md border border-border bg-card p-4 space-y-4">
        <h2 className="font-semibold">AI Filtering</h2>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="aiFilterEnabled"
            defaultChecked={settings.aiFilterEnabled}
          />
          Enable AI filtering
        </label>

        <div>
          <label className="block text-xs font-medium text-muted-foreground">AI Model</label>
          <input
            name="aiModel"
            defaultValue={settings.aiModel}
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Approval Timeout (seconds)
          </label>
          <input
            name="approvalTimeoutSecs"
            type="number"
            defaultValue={settings.approvalTimeoutSecs}
            className="mt-1 w-32 rounded-md border border-input px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4 space-y-4">
        <h2 className="font-semibold">Channels</h2>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="channelPersistMessageBodies"
            defaultChecked={settings.channelPersistMessageBodies}
            className="mt-0.5"
          />
          <span>
            Store chat message bodies
            <span className="block text-xs text-muted-foreground">
              When off, conversation rows still record audit metadata and tool calls, but raw message text is not saved.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-md border border-border bg-card p-4 space-y-4">
        <h2 className="font-semibold">Team Member Authentication</h2>

        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Default Session Duration (hours)
          </label>
          <input
            name="defaultSessionDurationHours"
            type="number"
            defaultValue={settings.defaultSessionDurationHours}
            className="mt-1 w-32 rounded-md border border-input px-3 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            720 = 30 days, 24 = daily re-auth
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4 space-y-4">
        <h2 className="font-semibold">Notifications</h2>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notifyEmail"
            defaultChecked={settings.notifyEmail}
          />
          Email notifications
        </label>

        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Webhook URL
          </label>
          <input
            name="notifyWebhookUrl"
            type="url"
            defaultValue={settings.notifyWebhookUrl || ""}
            placeholder="https://..."
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Slack Webhook URL
          </label>
          <input
            name="notifySlackWebhookUrl"
            type="url"
            defaultValue={settings.notifySlackWebhookUrl || ""}
            placeholder="https://hooks.slack.com/..."
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4 space-y-4">
        <h2 className="font-semibold">Log Retention</h2>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Retention (days)
          </label>
          <input
            name="logRetentionDays"
            type="number"
            defaultValue={settings.logRetentionDays}
            className="mt-1 w-32 rounded-md border border-input px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save settings"}
        </button>
        {saved && <span className="text-sm text-success">Saved!</span>}
      </div>
    </form>
  );
}
