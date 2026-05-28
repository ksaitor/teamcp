"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DESCRIPTION_PLACEHOLDER =
  "e.g. Senior data analyst on the Growth team.\n" +
  "Responsibilities: builds dashboards and owns weekly reporting.\n" +
  "Should have: read-only access to the analytics Postgres connector.\n" +
  "Should NOT have: access to Stripe, customer PII, or admin settings.";

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
        description: formData.get("description"),
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
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Add member
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 flex max-w-xl flex-col gap-4 rounded-md border border-gray-200 bg-white p-4"
    >
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-50">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
              No photo
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Profile picture <span className="text-gray-400">(optional)</span>
          </label>
          <input
            name="image"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="mt-1 text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600">Name</label>
          <input
            name="name"
            type="text"
            required
            placeholder="Jane Doe"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="member@example.com"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600">Description</label>
        <textarea
          name="description"
          required
          rows={5}
          placeholder={DESCRIPTION_PLACEHOLDER}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Inviting..." : "Invite"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
