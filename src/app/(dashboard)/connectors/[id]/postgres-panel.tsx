"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FiRefreshCw,
  FiCheckCircle,
  FiAlertCircle,
  FiDatabase,
  FiKey,
} from "react-icons/fi";
import {
  PG_CRUD_OPS,
  PG_BUILTIN_DEFAULTS,
  pgTableKey,
  resolvePgPermission,
  type PgPermissions,
} from "@/connectors/postgres/permissions";

interface PgTableInfo {
  schema: string;
  name: string;
  type: string;
}

interface InspectResult {
  ok: boolean;
  error?: string;
  user?: string;
  database?: string;
  version?: string;
  role?: {
    superuser: boolean;
    createDb: boolean;
    createRole: boolean;
    canLogin: boolean;
  };
  privileges?: string[];
  schemas?: string[];
  tables?: PgTableInfo[];
}

export function PostgresPanel({
  connectorId,
  config,
}: {
  connectorId: string;
  config: Record<string, any>;
}) {
  const router = useRouter();
  const [data, setData] = useState<InspectResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Local mirror of connector.config so the two permission editors below can
  // each PATCH without clobbering the other's slice.
  const [cfg, setCfg] = useState<Record<string, any>>(config);
  const cfgRef = useRef(cfg);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/connectors/${connectorId}/inspect`);
      const json = (await res.json()) as InspectResult;
      setData(res.ok ? json : { ok: false, error: json?.error || "Inspection failed" });
    } catch {
      setData({ ok: false, error: "Could not reach the database" });
    } finally {
      setLoading(false);
    }
  }, [connectorId]);

  useEffect(() => {
    load();
  }, [load]);

  const applyConfig = useCallback(
    async (next: Record<string, any>) => {
      cfgRef.current = next;
      setCfg(next);
      setSaving(true);
      setSaveError("");
      try {
        const res = await fetch(`/api/connectors/${connectorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: next }),
        });
        if (!res.ok) {
          setSaveError("Failed to save permissions.");
          return;
        }
        router.refresh();
      } catch {
        setSaveError("Failed to save permissions.");
      } finally {
        setSaving(false);
      }
    },
    [connectorId, router]
  );

  const setDefaults = (permissions: PgPermissions) =>
    applyConfig({ ...cfgRef.current, permissions });
  const setTablePermissions = (tablePermissions: Record<string, PgPermissions>) =>
    applyConfig({ ...cfgRef.current, tablePermissions });

  const connectorDefaults = (cfg.permissions ?? undefined) as PgPermissions | undefined;
  const tablePermissions = (cfg.tablePermissions ?? {}) as Record<string, PgPermissions>;

  return (
    <div className="space-y-6">
      <ConnectionInfo data={data} loading={loading} onRefresh={load} />

      {saveError && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <DefaultPermissions
        permissions={connectorDefaults}
        saving={saving}
        onChange={setDefaults}
      />

      <TablePermissions
        tables={data?.ok ? data.tables ?? [] : []}
        connectionOk={!!data?.ok}
        loading={loading}
        connectorDefaults={connectorDefaults}
        tablePermissions={tablePermissions}
        saving={saving}
        onChange={setTablePermissions}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Connection status + introspection summary                        */
/* ---------------------------------------------------------------- */

function ConnectionInfo({
  data,
  loading,
  onRefresh,
}: {
  data: InspectResult | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FiDatabase className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Database</h2>
          {!loading && data && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                data.ok
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {data.ok ? (
                <FiCheckCircle className="h-3 w-3" />
              ) : (
                <FiAlertCircle className="h-3 w-3" />
              )}
              {data.ok ? "Connected" : "Connection failed"}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-60"
        >
          <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {loading && !data && (
        <p className="mt-3 text-sm text-muted-foreground">Connecting to the database…</p>
      )}

      {data && !data.ok && (
        <div className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {data.error}
        </div>
      )}

      {data?.ok && (
        <div className="mt-4 space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <Field label="Connected as" value={data.user} mono />
            <Field label="Database" value={data.database} mono />
            <Field label="Schemas" value={String(data.schemas?.length ?? 0)} />
            <Field label="Tables" value={String(data.tables?.length ?? 0)} />
          </dl>

          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FiKey className="h-3.5 w-3.5" />
              Privileges this database user holds
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.role?.superuser && <Badge tone="warning">Superuser</Badge>}
              {data.role?.createDb && <Badge tone="info">Create DB</Badge>}
              {data.role?.createRole && <Badge tone="info">Create role</Badge>}
              {(data.privileges?.length ?? 0) > 0 ? (
                data.privileges!.map((p) => <Badge key={p}>{p}</Badge>)
              ) : !data.role?.superuser ? (
                <span className="text-xs text-muted-foreground">
                  No table-level grants reported (the role may rely on ownership
                  or PUBLIC).
                </span>
              ) : null}
              {data.role?.superuser && (
                <span className="text-xs text-muted-foreground">
                  Superusers bypass privilege checks — this connection can do
                  anything.
                </span>
              )}
            </div>
          </div>

          {(data.schemas?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Schemas ({data.schemas!.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.schemas!.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Connector-wide default CRUD permissions                           */
/* ---------------------------------------------------------------- */

function DefaultPermissions({
  permissions,
  saving,
  onChange,
}: {
  permissions: PgPermissions | undefined;
  saving: boolean;
  onChange: (perms: PgPermissions) => void;
}) {
  function checkedFor(key: "read" | "insert" | "update" | "delete") {
    return permissions?.[key] ?? PG_BUILTIN_DEFAULTS[key];
  }
  function toggle(key: "read" | "insert" | "update" | "delete", value: boolean) {
    // Persist explicit booleans for all four so the baseline is unambiguous.
    const next: PgPermissions = {
      read: checkedFor("read"),
      insert: checkedFor("insert"),
      update: checkedFor("update"),
      delete: checkedFor("delete"),
      [key]: value,
    };
    onChange(next);
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">Default permissions</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Baseline operations allowed across the whole database. New connectors
        are read-only — enable writes deliberately. Individual tables (below)
        and team members (further down) can override this.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PG_CRUD_OPS.map((op) => (
          <label
            key={op.key}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 hover:bg-accent hover:text-accent-foreground"
          >
            <input
              type="checkbox"
              checked={checkedFor(op.key)}
              disabled={saving}
              onChange={(e) => toggle(op.key, e.target.checked)}
              className="mt-0.5 rounded"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{op.label}</span>
              <span className="block text-xs text-muted-foreground">
                {op.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Schema changes (CREATE/ALTER/DROP) are allowed only when Insert, Update,
        and Delete are all enabled.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Per-table CRUD permissions                                        */
/* ---------------------------------------------------------------- */

function TablePermissions({
  tables,
  connectionOk,
  loading,
  connectorDefaults,
  tablePermissions,
  saving,
  onChange,
}: {
  tables: PgTableInfo[];
  connectionOk: boolean;
  loading: boolean;
  connectorDefaults: PgPermissions | undefined;
  tablePermissions: Record<string, PgPermissions>;
  saving: boolean;
  onChange: (tp: Record<string, PgPermissions>) => void;
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? tables.filter((t) =>
            pgTableKey(t.schema, t.name).toLowerCase().includes(q)
          )
        : tables,
    [tables, q]
  );

  function effective(
    key: string,
    op: "read" | "insert" | "update" | "delete"
  ) {
    return resolvePgPermission(op, connectorDefaults, undefined, tablePermissions[key]);
  }

  function toggle(
    key: string,
    op: "read" | "insert" | "update" | "delete",
    value: boolean
  ) {
    const next = {
      ...tablePermissions,
      [key]: { ...(tablePermissions[key] ?? {}), [op]: value },
    };
    onChange(next);
  }

  function resetTable(key: string) {
    const next = { ...tablePermissions };
    delete next[key];
    onChange(next);
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Per-table permissions</h2>
        {tables.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tables…"
            className="w-full max-w-xs rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Override the defaults for individual tables. Unchanged tables inherit the
        defaults above. <span className="font-medium">R</span> read,{" "}
        <span className="font-medium">I</span> insert,{" "}
        <span className="font-medium">U</span> update,{" "}
        <span className="font-medium">D</span> delete.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading tables…</p>
      ) : !connectionOk ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Connect to the database to manage per-table permissions.
        </p>
      ) : tables.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No tables found.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No tables match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const key = pgTableKey(t.schema, t.name);
            const overridden = !!tablePermissions[key];
            return (
              <div
                key={key}
                className="rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="block truncate text-xs font-medium" title={key}>
                    <span className="text-muted-foreground">{t.schema}.</span>
                    {t.name}
                  </code>
                  {overridden ? (
                    <button
                      onClick={() => resetTable(key)}
                      disabled={saving}
                      className="shrink-0 cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground disabled:cursor-default"
                      title="Reset to defaults"
                    >
                      reset
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      default
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex gap-3">
                  {PG_CRUD_OPS.map((op) => (
                    <label
                      key={op.key}
                      className="flex cursor-pointer items-center gap-1 text-xs"
                      title={op.label}
                    >
                      <input
                        type="checkbox"
                        checked={effective(key, op.key)}
                        disabled={saving}
                        onChange={(e) => toggle(key, op.key, e.target.checked)}
                        className="rounded"
                      />
                      {op.short}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Small presentational helpers                                      */
/* ---------------------------------------------------------------- */

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`truncate text-sm ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "info" | "warning";
}) {
  const cls =
    tone === "info"
      ? "bg-info/10 text-info"
      : tone === "warning"
        ? "bg-warning/10 text-warning"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}
