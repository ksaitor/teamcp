"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Downscale the chosen image to a small square avatar and return a data URI,
// so it fits comfortably in the User.image text column (no blob storage needed).
async function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");

  // Cover-crop to a centered square.
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);

  return canvas.toDataURL("image/jpeg", 0.85);
}

export function AddMemberForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<string | undefined>();

  function reset() {
    setError("");
    setImage(undefined);
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
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        name: formData.get("name"),
        jobTitle: formData.get("jobTitle"),
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
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Add member
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 flex max-w-xl flex-col gap-4 rounded-md border border-border bg-card p-4"
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <label className="block text-xs font-medium text-muted-foreground">Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="member@example.com"
            className="mt-1 w-full rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
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
      </div>
    </form>
  );
}
