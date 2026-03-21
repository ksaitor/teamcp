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

export function MemberControls({ member }: { member: Member }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isSuspended = member.status === "SUSPENDED";

  async function toggleSuspend() {
    setLoading(true);
    await fetch(`/api/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspend: !isSuspended }),
    });
    setLoading(false);
    router.refresh();
  }

  async function deleteMember() {
    if (!confirm("Remove this member from the organization?")) return;
    setLoading(true);
    await fetch(`/api/members/${member.id}`, { method: "DELETE" });
    router.push("/members");
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={toggleSuspend}
        disabled={loading}
        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
          isSuspended
            ? "bg-green-100 text-green-700 hover:bg-green-200"
            : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
        } disabled:opacity-50`}
      >
        {isSuspended ? "Reactivate" : "Suspend"}
      </button>
      <button
        onClick={deleteMember}
        disabled={loading}
        className="rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}
