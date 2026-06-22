"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { FiX } from "react-icons/fi";

export interface FilterOption {
  value: string;
  label: string;
}

const selectClass =
  "rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:outline-none";

export function LogsFilters({
  members,
  connectors,
  tools,
}: {
  members: FilterOption[];
  connectors: FilterOption[];
  tools: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const member = searchParams.get("member") ?? "";
  const connector = searchParams.get("connector") ?? "";
  const tool = searchParams.get("tool") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const hasFilters = Boolean(member || connector || tool || from || to);

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Member
        <select
          className={selectClass}
          value={member}
          onChange={(e) => setParam("member", e.target.value)}
        >
          <option value="">All members</option>
          {members.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Connector
        <select
          className={selectClass}
          value={connector}
          onChange={(e) => setParam("connector", e.target.value)}
        >
          <option value="">All connectors</option>
          {connectors.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Tool
        <select
          className={selectClass}
          value={tool}
          onChange={(e) => setParam("tool", e.target.value)}
        >
          <option value="">All tools</option>
          {tools.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        From
        <input
          type="date"
          className={selectClass}
          value={from}
          max={to || undefined}
          onChange={(e) => setParam("from", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        To
        <input
          type="date"
          className={selectClass}
          value={to}
          min={from || undefined}
          onChange={(e) => setParam("to", e.target.value)}
        />
      </label>

      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <FiX className="h-4 w-4" />
          Clear filters
        </button>
      )}
    </div>
  );
}
