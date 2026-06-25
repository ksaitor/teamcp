import pg from "pg";

export interface PgTableInfo {
  schema: string;
  name: string;
  type: string;
}

export interface PgInspectResult {
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
  /** Effective table privileges the connecting role holds (SELECT, INSERT, …). */
  privileges?: string[];
  schemas?: string[];
  tables?: PgTableInfo[];
}

/**
 * Live introspection of a PostgreSQL database: which user/role we connect as,
 * what privileges that role effectively holds, and which schemas/tables exist.
 *
 * We read the system catalog (`pg_catalog.pg_class` / `pg_namespace`) rather
 * than `information_schema.*`. The information_schema views are filtered to
 * objects the role has been *granted* privileges on and don't account for
 * privileges inherited through group roles, so they can come back empty even
 * for a user that can read everything. The catalog is visible to any role, and
 * `has_table_privilege()` reports *effective* access (honouring role
 * membership). Read-only and time-boxed so a bad connection string fails fast.
 */
export async function inspectPostgres(
  connectionString: string
): Promise<PgInspectResult> {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 8000,
    statement_timeout: 8000,
  });

  try {
    await client.connect();

    const ident = await client.query(
      `SELECT current_user AS "user", current_database() AS "database", version() AS "version"`
    );

    const role = await client.query(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolcanlogin
       FROM pg_catalog.pg_roles WHERE rolname = current_user`
    );

    // Tables, views, materialized views, partitioned and foreign tables, read
    // straight from the catalog so they show regardless of grant bookkeeping.
    const tables = await client.query(
      `SELECT n.nspname AS schema,
              c.relname AS name,
              CASE c.relkind
                WHEN 'r' THEN 'BASE TABLE'
                WHEN 'p' THEN 'BASE TABLE'
                WHEN 'v' THEN 'VIEW'
                WHEN 'm' THEN 'MATERIALIZED VIEW'
                WHEN 'f' THEN 'FOREIGN TABLE'
                ELSE c.relkind::text
              END AS type
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND n.nspname NOT LIKE 'pg_%'
         AND n.nspname <> 'information_schema'
       ORDER BY n.nspname, c.relname
       LIMIT 2000`
    );

    // Non-system schemas the role can actually use.
    const schemas = await client.query(
      `SELECT nspname AS schema
       FROM pg_catalog.pg_namespace
       WHERE nspname NOT LIKE 'pg_%'
         AND nspname <> 'information_schema'
         AND has_schema_privilege(current_user, nspname, 'USAGE')
       ORDER BY nspname`
    );

    // Effective CRUD privileges: true if the role can perform the op on ANY of
    // the discovered tables (covers privileges inherited via group roles).
    const priv = await client.query(
      `SELECT
         COALESCE(bool_or(has_table_privilege(c.oid, 'SELECT')), false) AS sel,
         COALESCE(bool_or(has_table_privilege(c.oid, 'INSERT')), false) AS ins,
         COALESCE(bool_or(has_table_privilege(c.oid, 'UPDATE')), false) AS upd,
         COALESCE(bool_or(has_table_privilege(c.oid, 'DELETE')), false) AS del
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p', 'f')
         AND n.nspname NOT LIKE 'pg_%'
         AND n.nspname <> 'information_schema'`
    );

    const p = priv.rows[0] ?? {};
    const privileges: string[] = [];
    if (p.sel) privileges.push("SELECT");
    if (p.ins) privileges.push("INSERT");
    if (p.upd) privileges.push("UPDATE");
    if (p.del) privileges.push("DELETE");

    const r = role.rows[0] ?? {};
    return {
      ok: true,
      user: ident.rows[0]?.user,
      database: ident.rows[0]?.database,
      version: ident.rows[0]?.version,
      role: {
        superuser: !!r.rolsuper,
        createDb: !!r.rolcreatedb,
        createRole: !!r.rolcreaterole,
        canLogin: !!r.rolcanlogin,
      },
      privileges,
      schemas: schemas.rows.map((row) => row.schema as string),
      tables: tables.rows.map((row) => ({
        schema: row.schema as string,
        name: row.name as string,
        type: row.type as string,
      })),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Failed to connect to the database" };
  } finally {
    await client.end().catch(() => {});
  }
}
