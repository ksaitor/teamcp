"use client";

import { useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";

/**
 * Type-ahead chip picker for the tables a team member may access on a Postgres
 * connector. Suggestions come from live introspection; the admin can also type
 * a `schema.table` name manually. An empty selection means no table access.
 *
 * The chip list is updated optimistically so add/remove feels instant — the
 * `onChange` persistence happens in the background.
 */
export function TableAccess({
  connectorId,
  value,
  disabled,
  onChange,
}: {
  connectorId: string;
  value: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Optimistic local copy of the selection. Re-syncs only when the persisted
  // value actually changes (keyed on content, not array identity) so a
  // background refresh doesn't clobber an in-flight edit.
  const [tables, setTables] = useState<string[]>(value);
  const valueKey = value.join("\n");
  useEffect(() => {
    setTables(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/connectors/${connectorId}/inspect`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const keys: string[] = (data.tables ?? []).map(
          (t: { schema: string; name: string }) => `${t.schema}.${t.name}`
        );
        setSuggestions(keys);
      } catch {
        /* leave suggestions empty; manual entry still works */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectorId]);

  function add(raw: string) {
    const v = raw.trim();
    setInput("");
    if (!v || tables.includes(v)) return;
    const next = [...tables, v];
    setTables(next); // optimistic
    onChange(next); // persist in background
  }

  function remove(v: string) {
    const next = tables.filter((x) => x !== v);
    setTables(next); // optimistic
    onChange(next); // persist in background
  }

  function addAll() {
    const next = [...tables, ...suggestions.filter((s) => !tables.includes(s))];
    if (next.length === tables.length) return;
    setTables(next); // optimistic
    onChange(next); // persist in background
  }

  function clearAll() {
    if (tables.length === 0) return;
    setTables([]); // optimistic
    onChange([]); // persist in background
  }

  const available = suggestions.filter((s) => !tables.includes(s));
  const listId = `tables-${connectorId}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Tables this member can access
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={disabled || available.length === 0}
            onClick={addAll}
            className="cursor-pointer text-xs font-medium text-primary hover:underline disabled:cursor-default disabled:opacity-50 disabled:no-underline"
          >
            Add all{suggestions.length > 0 ? ` (${suggestions.length})` : ""}
          </button>
          <button
            type="button"
            disabled={disabled || tables.length === 0}
            onClick={clearAll}
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-50"
          >
            Remove all
          </button>
        </div>
      </div>
      <div
        onClick={() => inputRef.current?.focus()}
        className="mt-1.5 flex cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:border-ring"
      >
        {tables.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            <code className="font-mono">{t}</code>
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                remove(t);
              }}
              className="cursor-pointer rounded-full text-primary/70 hover:text-primary disabled:cursor-default"
              aria-label={`Remove ${t}`}
            >
              <FiX className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          list={listId}
          value={input}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            // Selecting an exact suggestion (datalist click) adds it immediately.
            if (suggestions.includes(v)) add(v);
            else setInput(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            } else if (e.key === "Backspace" && !input && tables.length) {
              remove(tables[tables.length - 1]);
            }
          }}
          placeholder={
            tables.length === 0
              ? "No tables yet — click to grant access (schema.table)…"
              : "Add table…"
          }
          className="min-w-[12rem] flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
        <datalist id={listId}>
          {available.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {loaded && suggestions.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Couldn&rsquo;t load the table list — type names manually as
          <code className="mx-1 font-mono">schema.table</code>.
        </p>
      )}
    </div>
  );
}
