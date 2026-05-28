"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "APPROVED" | "DENIED") {
    setLoading(true);
    await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, status: action }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleAction("APPROVED")}
        disabled={loading}
        className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => handleAction("DENIED")}
        disabled={loading}
        className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
      >
        Deny
      </button>
    </div>
  );
}
