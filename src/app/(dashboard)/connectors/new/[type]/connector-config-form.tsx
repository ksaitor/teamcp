"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type {
  ConnectorType,
  CredentialField,
} from "@/lib/connectors-catalog";

export function ConnectorConfigForm({
  type,
  label,
  credentialField,
}: {
  type: ConnectorType;
  label: string;
  credentialField: CredentialField;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const credentials = formData.get("credentials") as string;
    const body: Record<string, unknown> = {
      name: formData.get("name"),
      type,
      credentials,
    };

    if (credentialField.configKey) {
      body.config = { [credentialField.configKey]: credentials };
    }

    const res = await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setLoading(false);
      const data = await res.json();
      setError(
        typeof data.error === "string" ? data.error : "Failed to add connector"
      );
      return;
    }

    router.push("/connectors");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-4"
      autoComplete="off"
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

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
          className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground">
          {credentialField.label}
        </label>
        <input
          name="credentials"
          type={credentialField.inputType}
          required
          placeholder={credentialField.placeholder}
          autoComplete={
            credentialField.inputType === "password" ? "new-password" : "off"
          }
          data-1p-ignore
          data-lpignore="true"
          className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? "Adding..." : "Add connector"}
        </Button>
      </div>
    </form>
  );
}
