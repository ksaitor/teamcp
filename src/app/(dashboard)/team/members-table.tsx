"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/ui/search-input";

export interface MemberRow {
  id: string;
  role: string;
  status: string;
  suspendedAt: Date | null;
  jobTitle: string | null;
  user: { name: string | null; email: string; image: string | null };
  connectorCount: number;
  lastActiveAt: Date | null;
  llmTokens: number;
}

export function MembersTable({ members }: { members: MemberRow[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.user.name, m.user.email, m.jobTitle, m.role]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [members, query]);

  return (
    <div className="mt-6">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search team members…"
        className="max-w-sm"
      />

      <div className="mt-4">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Title</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Connectors</th>
              <th className="pb-2 font-medium">Tokens</th>
              <th className="pb-2 font-medium">Last active</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {results.map((m) => (
              <tr key={m.id}>
                <td className="py-3">
                  <Link
                    href={`/team/${m.id}`}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    <Avatar name={m.user.name} email={m.user.email} image={m.user.image} />
                    {m.user.name || "—"}
                  </Link>
                </td>
                <td className="py-3 text-muted-foreground">{m.user.email}</td>
                <td className="py-3 text-muted-foreground" title={m.jobTitle || undefined}>
                  {m.jobTitle
                    ? m.jobTitle.length > 120
                      ? `${m.jobTitle.slice(0, 120)}…`
                      : m.jobTitle
                    : "—"}
                </td>
                <td className="py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {m.role}
                  </span>
                </td>
                <td className="py-3">
                  <StatusBadge status={m.status} suspendedAt={m.suspendedAt} />
                </td>
                <td className="py-3 text-muted-foreground">{m.connectorCount}</td>
                <td className="py-3 text-muted-foreground" title={`${m.llmTokens.toLocaleString()} tokens`}>
                  {formatTokens(m.llmTokens)}
                </td>
                <td className="py-3 text-muted-foreground">
                  <LastActive at={m.lastActiveAt} />
                </td>
                <td className="py-3">
                  <Link
                    href={`/team/${m.id}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Configure
                  </Link>
                </td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  {members.length === 0
                    ? "No team members yet. Add one above."
                    : `No team members match “${query}”.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Avatar({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string;
  image: string | null;
}) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={image}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initial = (name || email).charAt(0).toUpperCase();
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {initial}
    </span>
  );
}

// Compact token count ("—", "850", "12.3K", "4.1M").
function formatTokens(n: number) {
  if (!n) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function LastActive({ at }: { at: Date | null }) {
  if (!at) return <span className="text-muted-foreground">Never</span>;
  const date = new Date(at);
  return (
    <span title={date.toLocaleString()}>{formatRelativeTime(date)}</span>
  );
}

// Compact relative time ("just now", "5m ago", "3d ago", or a date for older).
function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "Just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
}

function StatusBadge({ status, suspendedAt }: { status: string; suspendedAt: Date | null }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-success/10 text-success",
    INVITED: "bg-info/10 text-info",
    SUSPENDED: "bg-destructive/10 text-destructive",
    REVOKED: "bg-muted text-muted-foreground",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || ""}`}>
      {status}
      {suspendedAt && (
        <span className="ml-1 text-[10px] opacity-70">
          since {new Date(suspendedAt).toLocaleDateString()}
        </span>
      )}
    </span>
  );
}
