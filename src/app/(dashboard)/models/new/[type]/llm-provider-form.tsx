"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { LlmProviderType } from "@/lib/llm-providers-catalog";

export function LlmProviderForm({
  type,
  label,
  defaultBaseUrl,
  baseUrlEditable,
  requiresApiKey,
  suggestedModels,
}: {
  type: LlmProviderType;
  label: string;
  defaultBaseUrl: string;
  baseUrlEditable: boolean;
  requiresApiKey: boolean;
  suggestedModels: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const baseUrlRequired = type === "CUSTOM_OPENAI";
  const modelListId = `models-${type}`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const apiKey = (formData.get("apiKey") as string)?.trim();
    const baseUrl = (formData.get("baseUrl") as string)?.trim();

    const body: Record<string, unknown> = {
      name: formData.get("name"),
      type,
      defaultModel: (formData.get("defaultModel") as string)?.trim(),
    };
    if (apiKey) body.apiKey = apiKey;
    if (baseUrl) body.baseUrl = baseUrl;

    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setLoading(false);
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Failed to add provider"
      );
      return;
    }

    router.push("/models");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" autoComplete="off">
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        <label className="block text-xs font-medium text-muted-foreground">
          Name
        </label>
        <input
          name="name"
          required
          placeholder={`e.g., Production ${label}`}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
        />
      </div>

      {requiresApiKey && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            API key
          </label>
          <input
            name="apiKey"
            type="password"
            required
            placeholder="sk-..."
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
      )}

      {baseUrlEditable && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Base URL{baseUrlRequired ? "" : " (optional)"}
          </label>
          <input
            name="baseUrl"
            type="url"
            required={baseUrlRequired}
            defaultValue={defaultBaseUrl || undefined}
            placeholder="https://api.example.com/v1"
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-muted-foreground">
          Model
        </label>
        <input
          name="defaultModel"
          required
          list={suggestedModels.length ? modelListId : undefined}
          defaultValue={suggestedModels[0] || undefined}
          placeholder="model-id"
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
        />
        {suggestedModels.length > 0 && (
          <datalist id={modelListId}>
            {suggestedModels.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a suggestion or type any model ID this provider supports.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? "Adding…" : "Add provider"}
        </Button>
      </div>
    </form>
  );
}
