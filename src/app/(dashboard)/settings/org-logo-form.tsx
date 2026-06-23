"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiUpload } from "react-icons/fi";
import { fileToAvatarDataUrl } from "@/lib/avatar";

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

export function OrgLogoForm({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logo, setLogo] = useState<string | null>(logoUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const dirty = logo !== logoUrl;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Logo must be an image file");
      e.target.value = "";
      return;
    }
    try {
      setError("");
      setSuccess("");
      setLogo(await fileToAvatarDataUrl(file));
    } catch {
      setError("Could not read that image");
    }
    e.target.value = "";
  }

  async function save(next: string | null) {
    setError("");
    setSuccess("");
    setLoading(true);

    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: next }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Failed to save logo");
      setLogo(logoUrl);
      return;
    }

    setSuccess("Saved");
    router.refresh();
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-4">
      <div>
        <h2 className="font-semibold">Team logo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown to team members on the authorization screen when they connect an MCP client.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative block h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted"
          aria-label="Upload team logo"
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-full w-full object-contain p-1.5" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {initialsOf(name)}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-foreground/40 text-background opacity-0 transition-opacity group-hover:opacity-100">
            <FiUpload className="h-5 w-5" />
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => save(logo)}
            disabled={loading || !dirty}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save logo"}
          </button>
          {logo && (
            <button
              type="button"
              onClick={() => {
                setLogo(null);
                save(null);
              }}
              disabled={loading}
              className="text-sm text-destructive hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
          {success && !error && <span className="text-sm text-success">{success}</span>}
        </div>
      </div>
    </div>
  );
}
