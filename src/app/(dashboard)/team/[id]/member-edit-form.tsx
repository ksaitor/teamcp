"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiUpload } from "react-icons/fi";
import { fileToAvatarDataUrl } from "@/lib/avatar";

type Role = "OWNER" | "ADMIN" | "MEMBER";

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

interface Props {
  membershipId: string;
  initial: {
    name: string;
    email: string;
    image: string | null;
    jobTitle: string | null;
    responsibilities: string | null;
    permissionInstructions: string | null;
    role: Role;
  };
  stats: { label: string; value: string }[];
  sessionRole: Role;
  isSelf: boolean;
}

export function MemberEditForm({ membershipId, initial, stats, sessionRole, isSelf }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial.name);
  const [image, setImage] = useState<string | null>(initial.image);
  const [jobTitle, setJobTitle] = useState(initial.jobTitle ?? "");
  const [responsibilities, setResponsibilities] = useState(initial.responsibilities ?? "");
  const [permissionInstructions, setPermissionInstructions] = useState(
    initial.permissionInstructions ?? ""
  );
  const [role, setRole] = useState<Role>(initial.role);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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

  const wantsOwnershipTransfer = !isSelf && role === "OWNER" && initial.role !== "OWNER";

  const isDirty =
    name !== initial.name ||
    jobTitle !== (initial.jobTitle ?? "") ||
    responsibilities !== (initial.responsibilities ?? "") ||
    permissionInstructions !== (initial.permissionInstructions ?? "") ||
    image !== initial.image ||
    (!isSelf && role !== initial.role);

  async function save() {
    setError("");
    setSuccess("");
    setLoading(true);

    const body: Record<string, unknown> = {
      name: name.trim() || null,
      jobTitle: jobTitle.trim() || null,
      responsibilities: responsibilities.trim() || null,
      permissionInstructions: permissionInstructions.trim() || null,
    };
    if (!isSelf) body.role = role;
    if (image !== initial.image) body.image = image;

    const res = await fetch(`/api/team/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);
    setConfirmingTransfer(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string"
          ? data.error
          : Array.isArray(data.error)
            ? data.error.map((e: { message: string }) => e.message).join(", ")
            : "Failed to save changes"
      );
      return;
    }

    setSuccess("Saved");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (wantsOwnershipTransfer) {
      setConfirmingTransfer(true);
      return;
    }
    await save();
  }

  const initial1 = (name || initial.email).charAt(0).toUpperCase();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group block h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-muted"
            aria-label="Change profile picture"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-medium text-muted-foreground">
                {initial1}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/40 text-background opacity-0 transition-opacity group-hover:opacity-100">
              <FiUpload className="h-5 w-5" />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
          />
        </div>

        <div className="min-w-0 flex-1">
          {editingField === "name" ? (
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setEditingField(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  setEditingField(null);
                }
              }}
              placeholder="Name"
              className="w-full rounded-md border border-input bg-background px-3 py-0.5 text-2xl font-bold focus:border-ring focus:outline-none"
            />
          ) : (
            <div
              onDoubleClick={() => setEditingField("name")}
              title="Double-click to edit"
              className="cursor-text rounded-md border border-transparent px-3 py-0.5 text-2xl font-bold hover:bg-accent"
            >
              {name || <span className="text-muted-foreground">Name</span>}
            </div>
          )}

          {editingField === "jobTitle" ? (
            <input
              autoFocus
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              onBlur={() => setEditingField(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  setEditingField(null);
                }
              }}
              placeholder="Job title (e.g. Marketing Manager)"
              className="w-full rounded-md border border-input px-3 py-0.5 text-sm focus:border-ring focus:outline-none"
            />
          ) : (
            <div
              onDoubleClick={() => setEditingField("jobTitle")}
              title="Double-click to edit"
              className="cursor-text rounded-md border border-transparent px-3 py-0.5 text-sm hover:bg-accent"
            >
              {jobTitle || (
                <span className="text-muted-foreground">Job title (e.g. Marketing Manager)</span>
              )}
            </div>
          )}

          <p className="px-3 text-sm text-muted-foreground">{initial.email}</p>

          {!isSelf && (
            <div className="flex items-center gap-2 px-3 pt-1">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              {editingField === "role" ? (
                <select
                  autoFocus
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  onBlur={() => setEditingField(null)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:outline-none"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                  <option value="OWNER" disabled={sessionRole !== "OWNER"}>
                    Owner{sessionRole !== "OWNER" ? " (owners only)" : ""}
                  </option>
                </select>
              ) : (
                <span
                  onDoubleClick={() => setEditingField("role")}
                  title="Double-click to edit"
                  className="cursor-text rounded-md border border-transparent px-2 py-1 text-sm hover:bg-accent"
                >
                  {ROLE_LABELS[role]}
                </span>
              )}
            </div>
          )}
        </div>

        {stats.length > 0 && (
          // Two right-aligned rows: the date stats (Last active / Updated /
          // Created) always on the first line, everything else on the second.
          <dl className="ml-auto hidden shrink-0 flex-col gap-y-2 text-right sm:flex">
            {[stats.slice(0, 3), stats.slice(3)].map(
              (row, r) =>
                row.length > 0 && (
                  <div key={r} className="flex justify-end gap-x-5">
                    {row.map((s) => (
                      <div key={s.label}>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                          {s.label}
                        </dt>
                        <dd className="text-xs text-muted-foreground">{s.value}</dd>
                      </div>
                    ))}
                  </div>
                )
            )}
          </dl>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Responsibilities</h2>
        <p className="text-sm text-muted-foreground">
          Visible only to admins. Used as AI context so the assistant knows this member&apos;s role,
          job description, and what they&apos;re responsible for.
        </p>
        {editingField === "responsibilities" ? (
          <textarea
            autoFocus
            value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)}
            onBlur={() => setEditingField(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingField(null);
            }}
            placeholder={
              "e.g. Marketing Manager. Owns the company blog and email campaigns. " +
              "Responsible for SEO, content calendar, and tracking acquisition metrics. " +
              "Does not handle billing, payroll, or product roadmap."
            }
            rows={5}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        ) : (
          <div
            onDoubleClick={() => setEditingField("responsibilities")}
            title="Double-click to edit"
            className="mt-2 min-h-[2.5rem] cursor-text whitespace-pre-wrap rounded-md border border-transparent px-3 py-2 text-sm hover:bg-accent"
          >
            {responsibilities || (
              <span className="text-muted-foreground">
                e.g. Marketing Manager. Owns the company blog and email campaigns. Responsible for
                SEO, content calendar, and tracking acquisition metrics. Does not handle billing,
                payroll, or product roadmap.
              </span>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Permission Instructions</h2>
        <p className="text-sm text-muted-foreground">
          Natural language instructions for AI filtering (applies to all connectors).
        </p>
        {editingField === "permissionInstructions" ? (
          <textarea
            autoFocus
            value={permissionInstructions}
            onChange={(e) => setPermissionInstructions(e.target.value)}
            onBlur={() => setEditingField(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingField(null);
            }}
            placeholder="e.g., Marketing team member. No access to financial data, API keys, or employee salaries."
            rows={3}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        ) : (
          <div
            onDoubleClick={() => setEditingField("permissionInstructions")}
            title="Double-click to edit"
            className="mt-2 min-h-[2.5rem] cursor-text whitespace-pre-wrap rounded-md border border-transparent px-3 py-2 text-sm hover:bg-accent"
          >
            {permissionInstructions || (
              <span className="text-muted-foreground">
                e.g., Marketing team member. No access to financial data, API keys, or employee
                salaries.
              </span>
            )}
          </div>
        )}
      </div>

      {confirmingTransfer && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4">
          <h3 className="text-sm font-semibold text-warning">Transfer ownership?</h3>
          <p className="mt-1 text-sm text-foreground">
            Making {name || initial.email} the owner will demote you to Admin. Only the owner can
            promote someone else to Owner, so you won&apos;t be able to undo this on your own.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={loading}
              className="rounded-md bg-warning px-3 py-1.5 text-sm font-medium text-white hover:bg-warning/90 disabled:opacity-50"
            >
              {loading ? "Transferring…" : "Yes, transfer ownership"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingTransfer(false)}
              disabled={loading}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {(isDirty || loading) && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || confirmingTransfer}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
          {error && <span className="text-sm text-destructive">{error}</span>}
          {success && !error && <span className="text-sm text-success">{success}</span>}
        </div>
      )}
    </form>
  );
}
