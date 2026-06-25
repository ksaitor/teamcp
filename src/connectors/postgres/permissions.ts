/**
 * Pure (no `pg` / node deps) Postgres permission helpers, shared between the
 * connector's Layer-2 enforcement, the inspect API route, and the admin UI.
 *
 * CRUD permissions can be set at three levels (most specific wins):
 *  - per-table overrides, stored on `connector.config.tablePermissions[schema.table]`
 *  - per-member overrides, stored on `MemberConnectorAccess.nativePermissions.permissions`
 *  - connector-wide defaults, stored on `connector.config.permissions`
 *
 * When nothing is configured the built-in default applies: reading is allowed,
 * writes (insert / update / delete) are denied. New connectors are therefore
 * read-only until an admin opts into writes.
 */

export type PgCrudOp = "read" | "insert" | "update" | "delete";

/** The four toggles shown in the admin UI, in display order. */
export const PG_CRUD_OPS: { key: PgCrudOp; label: string; short: string; description: string }[] = [
  { key: "read", label: "Read", short: "R", description: "Run SELECT queries and inspect tables" },
  { key: "insert", label: "Insert", short: "I", description: "Add new rows (INSERT)" },
  { key: "update", label: "Update", short: "U", description: "Modify existing rows (UPDATE)" },
  { key: "delete", label: "Delete", short: "D", description: "Remove rows (DELETE)" },
];

/** Built-in fallback: read-only. Writes must be explicitly enabled. */
export const PG_BUILTIN_DEFAULTS: Record<PgCrudOp, boolean> = {
  read: true,
  insert: false,
  update: false,
  delete: false,
};

export interface PgPermissions {
  read?: boolean;
  insert?: boolean;
  update?: boolean;
  delete?: boolean;
  /** Schema/grant changes — not surfaced as its own toggle (see resolvePgPermission). */
  ddl?: boolean;
}

/** A SQL statement's effective category. `ddl` covers schema/grant changes. */
export type PgSqlCategory = PgCrudOp | "ddl";

/**
 * Classify a SQL statement by its leading keyword. This is a pragmatic
 * classifier, not a full parser — the read-only transaction around `pg_query`
 * and the AI filter layer provide defense in depth.
 */
export function classifyStatement(sql: string): PgSqlCategory {
  // Strip leading line/block comments and whitespace to reach the first keyword.
  const cleaned = sql.replace(/^(?:\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/, "");
  const kw = (cleaned.match(/^[a-zA-Z]+/)?.[0] ?? "").toLowerCase();
  switch (kw) {
    case "select":
    case "show":
    case "explain":
    case "values":
    case "table":
      return "read";
    case "insert":
      return "insert";
    case "update":
      return "update";
    case "delete":
      return "delete";
    case "with":
      // A CTE can wrap a writing statement (e.g. `WITH x AS (...) DELETE ...`).
      // Treat it as the strongest write verb present; default to read.
      if (/\bdelete\b/i.test(sql)) return "delete";
      if (/\bupdate\b/i.test(sql)) return "update";
      if (/\binsert\b/i.test(sql)) return "insert";
      return "read";
    default:
      // CREATE / ALTER / DROP / TRUNCATE / GRANT / REVOKE / etc.
      return "ddl";
  }
}

/**
 * Resolve whether a category is permitted. Precedence, most specific first:
 * per-table override → per-member override → connector default → built-in
 * (read-only). DDL is intentionally not a UI toggle: schema changes are only
 * allowed when the role is effectively full-write (insert + update + delete all
 * granted), unless an explicit `ddl` flag is set.
 */
export function resolvePgPermission(
  category: PgSqlCategory,
  connectorDefaults: PgPermissions | undefined,
  memberOverrides: PgPermissions | undefined,
  tableOverrides?: PgPermissions | undefined
): boolean {
  if (category === "ddl") {
    const explicit =
      tableOverrides?.ddl ?? memberOverrides?.ddl ?? connectorDefaults?.ddl;
    if (typeof explicit === "boolean") return explicit;
    return (
      resolvePgPermission("insert", connectorDefaults, memberOverrides, tableOverrides) &&
      resolvePgPermission("update", connectorDefaults, memberOverrides, tableOverrides) &&
      resolvePgPermission("delete", connectorDefaults, memberOverrides, tableOverrides)
    );
  }
  const t = tableOverrides?.[category];
  if (typeof t === "boolean") return t;
  const m = memberOverrides?.[category];
  if (typeof m === "boolean") return m;
  const d = connectorDefaults?.[category];
  if (typeof d === "boolean") return d;
  return PG_BUILTIN_DEFAULTS[category];
}

/** Human-friendly denial reason for a blocked category. */
export function pgDenialReason(category: PgSqlCategory, table?: string): string {
  const where = table ? ` for table '${table}'` : " for this database connector";
  switch (category) {
    case "read":
      return `Read access is disabled${where}`;
    case "insert":
      return `Inserting rows is disabled${where}`;
    case "update":
      return `Updating rows is disabled${where}`;
    case "delete":
      return `Deleting rows is disabled${where}`;
    case "ddl":
      return `Schema changes (CREATE/ALTER/DROP) are disabled${where}`;
  }
}

/** Canonical key for per-table permissions. */
export function pgTableKey(schema: string, name: string): string {
  return `${schema}.${name}`;
}

function isIdentChar(c: string | undefined): boolean {
  return !!c && /[a-z0-9_]/i.test(c);
}

/** True if `word` appears in `sql` as a whole identifier (case-insensitive). */
function wholeWordInSql(word: string, lowerSql: string): boolean {
  const w = word.toLowerCase();
  if (!w) return false;
  let idx = lowerSql.indexOf(w);
  while (idx !== -1) {
    const before = idx > 0 ? lowerSql[idx - 1] : undefined;
    const after = lowerSql[idx + w.length];
    // Allow a leading `.` (schema-qualified) but not other identifier chars.
    if ((!isIdentChar(before) || before === ".") && !isIdentChar(after)) {
      return true;
    }
    idx = lowerSql.indexOf(w, idx + w.length);
  }
  return false;
}

/**
 * Best-effort: which configured table keys are referenced by a SQL statement.
 * Matches either the bare table name or the full `schema.table` as a whole
 * identifier. Not a parser — paired with the AI filter for nuanced cases.
 */
export function referencedTableKeys(
  sql: string | undefined,
  configuredKeys: string[]
): string[] {
  if (!sql) return [];
  const lower = sql.toLowerCase();
  return configuredKeys.filter((key) => {
    const bare = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
    return wholeWordInSql(key, lower) || wholeWordInSql(bare, lower);
  });
}

/**
 * Best-effort extraction of table references from a SQL statement: identifiers
 * following FROM / JOIN / INTO / UPDATE. Not a full parser — paired with the AI
 * filter for nuanced cases.
 */
export function extractSqlTableRefs(sql: string): string[] {
  const refs = new Set<string>();
  const re =
    /\b(?:from|join|into|update)\s+("?[a-z_][\w$]*"?(?:\s*\.\s*"?[a-z_][\w$]*"?)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    refs.add(m[1].replace(/\s+/g, "").replace(/"/g, ""));
  }
  return [...refs];
}

/**
 * Whether a table reference (bare `name` or `schema.name`) matches one of the
 * member's granted table keys. Matching is case-insensitive and compares the
 * bare table name so `orders` matches a granted `public.orders`.
 */
export function isTableRefAllowed(ref: string, allowedKeys: string[]): boolean {
  const r = ref.toLowerCase().replace(/"/g, "");
  const rBare = r.includes(".") ? r.slice(r.indexOf(".") + 1) : r;
  return allowedKeys.some((key) => {
    const k = key.toLowerCase();
    const kBare = k.includes(".") ? k.slice(k.indexOf(".") + 1) : k;
    return k === r || kBare === rBare;
  });
}

/**
 * Whether a table reference points at the system catalog or information_schema.
 * These are metadata (not user data), so they're exempt from the per-member
 * table whitelist — a member can always introspect structure via pg_query.
 */
export function isSystemTableRef(ref: string): boolean {
  const r = ref.toLowerCase().replace(/"/g, "");
  const schema = r.includes(".") ? r.slice(0, r.indexOf(".")) : "";
  const bare = r.includes(".") ? r.slice(r.indexOf(".") + 1) : r;
  if (schema === "information_schema" || schema.startsWith("pg_")) return true;
  // Unqualified catalog tables (pg_class, pg_tables, pg_stat_*, …).
  if (bare.startsWith("pg_")) return true;
  return false;
}
