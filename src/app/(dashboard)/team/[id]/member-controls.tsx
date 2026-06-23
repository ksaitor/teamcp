"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Member {
  id: string;
  name: string;
  email: string;
  status: string;
  suspendedAt: Date | null;
  role: string;
}

export function MemberControls({
  member,
  isSelf,
}: {
  member: Member;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState("");
  const isSuspended = member.status === "SUSPENDED";
  const label = member.name || member.email;

  async function toggleSuspend() {
    setLoading(true);
    setError("");
    await fetch(`/api/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspend: !isSuspended }),
    });
    setLoading(false);
    router.refresh();
  }

  async function deleteMember() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/team/${member.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Failed to remove team member");
      setLoading(false);
      setConfirmingRemove(false);
      return;
    }
    router.push("/team");
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={toggleSuspend}
          disabled={loading}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            isSuspended
              ? "bg-success/10 text-success hover:bg-success/20"
              : "bg-warning/10 text-warning hover:bg-warning/20"
          } disabled:opacity-50`}
        >
          {isSuspended ? "Reactivate" : "Suspend"}
        </button>

        {!confirmingRemove ? (
          <button
            onClick={() => {
              setError("");
              setConfirmingRemove(true);
            }}
            disabled={loading || isSelf}
            title={isSelf ? "You can't remove yourself from the organization." : undefined}
            className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5">
            <span className="text-sm text-destructive">
              Remove {label} from this organization?
            </span>
            <button
              onClick={deleteMember}
              disabled={loading}
              className="rounded-md bg-destructive px-3 py-1 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
            >
              {loading ? "Removing…" : "Yes, remove"}
            </button>
            <button
              onClick={() => setConfirmingRemove(false)}
              disabled={loading}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {isSelf && (
        <p className="text-xs text-muted-foreground">
          You can&apos;t remove yourself from the organization.
        </p>
      )}
    </div>
  );
}
