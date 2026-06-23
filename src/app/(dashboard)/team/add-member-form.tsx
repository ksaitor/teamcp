"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import { fileToAvatarDataUrl } from "@/lib/avatar";

export function AddMemberForm({ mode = "toggle" }: { mode?: "toggle" | "standalone" } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(mode === "standalone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [advanced, setAdvanced] = useState(false);

  function reset() {
    setError("");
    setImage(undefined);
    if (mode === "standalone") {
      router.push("/team");
      return;
    }
    setOpen(false);
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setImage(undefined);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Profile picture must be an image file");
      e.target.value = "";
      return;
    }
    try {
      setError("");
      setImage(await fileToAvatarDataUrl(file));
    } catch {
      setError("Could not read that image");
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        name: formData.get("name"),
        jobTitle: formData.get("jobTitle"),
        responsibilities: (formData.get("responsibilities") as string)?.trim() || undefined,
        permissionInstructions:
          (formData.get("permissionInstructions") as string)?.trim() || undefined,
        image,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(
        typeof data.error === "string"
          ? data.error
          : Array.isArray(data.error)
            ? data.error.map((e: { message: string }) => e.message).join(", ")
            : "Failed to add member"
      );
      return;
    }

    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Add member
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex w-full basis-full max-w-xl flex-col gap-4"
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <label className="block text-xs font-medium text-muted-foreground">Email</label>
        <input
          name="email"
          type="email"
          required
          placeholder="member@example.com"
          className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground">Name</label>
        <input
          name="name"
          type="text"
          required
          placeholder="Jane Doe"
          className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground">Job title</label>
        <input
          name="jobTitle"
          type="text"
          required
          placeholder="e.g. Marketing Manager"
          className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
        />
      </div>

      {advanced && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  No photo
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">
                Profile picture <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                name="image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="mt-1 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Responsibilities <span className="text-muted-foreground">(optional)</span>
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Visible only to admins. Used as AI context so the assistant knows this member&apos;s role,
              job description, and what they&apos;re responsible for.
            </p>
            <textarea
              name="responsibilities"
              rows={4}
              placeholder={
                "e.g. Marketing Manager. Owns the company blog and email campaigns. " +
                "Responsible for SEO, content calendar, and tracking acquisition metrics. " +
                "Does not handle billing, payroll, or product roadmap."
              }
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Permission Instructions <span className="text-muted-foreground">(optional)</span>
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Natural language instructions for AI filtering (applies to all connectors).
            </p>
            <textarea
              name="permissionInstructions"
              rows={3}
              placeholder="e.g., Marketing team member. No access to financial data, API keys, or employee salaries."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Inviting..." : "Invite"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          aria-expanded={advanced}
        >
          Advanced
          {advanced ? (
            <FiChevronUp className="h-4 w-4" />
          ) : (
            <FiChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>
    </form>
  );
}
