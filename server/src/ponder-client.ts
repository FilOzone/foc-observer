/**
 * Client for querying Ponder-indexed FOC data.
 * SQL queries go directly to Postgres in a READ ONLY transaction.
 * Validation is handled by sql-validator.ts (libpg-query AST allow-list).
 */

import pg from "pg"
import { logBackendError } from "./logger.js"
import type { NetworkConfig } from "./networks.js"
import { ServiceUnavailableError } from "./public-error.js"
import { InputError } from "./inputs.js"
import { validateSql, MAX_ROWS } from "./sql-validator.js"
import { columnNotes } from "./table-metadata.js"

export const MAX_RESULT_BYTES = 16 * 1_024 * 1_024
export const MAX_PG_ROW_BYTES = 4 * 1_024 * 1_024
const FETCH_BATCH_ROWS = 4
const POOL_SIZE = 12

export interface SqlSizeMetrics {
  resultBytes?: number
  maxRowBytes?: number
  limitHit?: "pg_row" | "result_bytes" | "explain_rows"
}

export interface SqlResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated?: true
  message?: string
}

export interface TableInfo {
  name: string
  rowCount: number
  description: string
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  note?: string
}

import { TABLES } from "./schema-defs.js"

/** The role provisioned by postgres/provision.sh; the only one the server serves SQL as. */
export const QUERY_ROLE = "foc_observer_query"
export const PONDER_OWNER_ROLE = "ponder"

/**
 * Role attributes read by PonderClient.checkQueryRole. Schema lists exclude pg_* and
 * information_schema. Names are cast to text because node-postgres leaves name[] unparsed.
 */
export interface QueryRoleAttributes {
  /** The role the connection authenticated as (session_user). */
  login: string
  /** The role queries run as (current_user); the privilege fields describe this role. */
  role: string
  rolsuper: boolean
  rolcreaterole: boolean
  rolcreatedb: boolean
  rolreplication: boolean
  rolbypassrls: boolean
  db_create: boolean
  db_temp: boolean
  /** Roles this role is a direct member of, built-in or custom. */
  member_of: string[]
  /** Schemas where the role can create objects. */
  create_schemas: string[]
  /** Schemas other than public that the role can use. */
  usage_schemas: string[]
  /** Relations the role can read, including their relation kind and column-level grants. */
  read_relations: string[]
  /** Readable public views that Ponder did not publish as direct data_vN projections. */
  invalid_public_views: string[]
  /** Schemas holding a relation the role owns or can write to, at table or column level. */
  write_schemas: string[]
}

const QUERY_ROLE_SQL = `
  WITH app_schemas AS (
    SELECT oid, nspname FROM pg_namespace
    WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
  ),
  readable_public_views AS (
    SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND (has_table_privilege(c.oid, 'SELECT') OR has_any_column_privilege(c.oid, 'SELECT'))
  )
  SELECT session_user::text AS login, r.rolname::text AS role, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolbypassrls,
    has_database_privilege(current_database(), 'CREATE') AS db_create,
    has_database_privilege(current_database(), 'TEMPORARY') AS db_temp,
    ARRAY(
      SELECT g.rolname::text FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
      WHERE m.member = r.oid ORDER BY 1
    ) AS member_of,
    ARRAY(SELECT nspname::text FROM app_schemas WHERE has_schema_privilege(oid, 'CREATE') ORDER BY 1) AS create_schemas,
    ARRAY(
      SELECT nspname::text FROM app_schemas WHERE nspname <> 'public' AND has_schema_privilege(oid, 'USAGE') ORDER BY 1
    ) AS usage_schemas,
    ARRAY(
      SELECT s.nspname::text || '.' || c.relname::text || ':' || c.relkind::text
      FROM pg_class c
      JOIN app_schemas s ON s.oid = c.relnamespace
      WHERE has_schema_privilege(s.oid, 'USAGE')
        AND ((c.relkind IN ('r', 'v', 'm', 'p', 'f')
          AND (has_table_privilege(c.oid, 'SELECT') OR has_any_column_privilege(c.oid, 'SELECT')))
        OR (c.relkind = 'S' AND has_sequence_privilege(c.oid, 'SELECT')))
      ORDER BY 1
    ) AS read_relations,
    ARRAY(
      SELECT public_view.relname::text
      FROM readable_public_views public_view
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_class view_relation
        JOIN pg_namespace view_namespace ON view_namespace.oid = view_relation.relnamespace
        JOIN pg_rewrite rewrite_rule ON rewrite_rule.ev_class = view_relation.oid
        JOIN pg_depend dependency ON dependency.classid = 'pg_rewrite'::regclass
          AND dependency.objid = rewrite_rule.oid
          AND dependency.refclassid = 'pg_class'::regclass
          AND dependency.deptype = 'n'
        JOIN pg_class source_relation ON source_relation.oid = dependency.refobjid
        JOIN pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
        WHERE view_relation.oid = public_view.oid
          AND view_namespace.nspname = 'public'
          AND view_relation.relowner = (SELECT oid FROM pg_roles WHERE rolname = '${PONDER_OWNER_ROLE}')
          AND source_namespace.nspname ~ '^data_v[0-9]+$'
          AND source_relation.relkind IN ('r', 'p')
          AND source_relation.relname = public_view.relname
          AND source_relation.relowner = (SELECT oid FROM pg_roles WHERE rolname = '${PONDER_OWNER_ROLE}')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_depend other_dependency
            WHERE other_dependency.classid = 'pg_rewrite'::regclass
              AND other_dependency.objid = rewrite_rule.oid
              AND other_dependency.refclassid = 'pg_class'::regclass
              AND other_dependency.deptype = 'n'
              AND other_dependency.refobjid <> source_relation.oid
          )
          AND btrim(regexp_replace(pg_get_viewdef(view_relation.oid, true), '\\s+', ' ', 'g')) = (
            SELECT format(
              'SELECT %s FROM %I.%I;',
              string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum),
              source_namespace.nspname,
              source_relation.relname
            )
            FROM pg_attribute attribute
            WHERE attribute.attrelid = source_relation.oid
              AND attribute.attnum > 0
              AND NOT attribute.attisdropped
          )
      )
      ORDER BY 1
    ) AS invalid_public_views,
    ARRAY(
      SELECT DISTINCT s.nspname::text FROM pg_class c JOIN app_schemas s ON s.oid = c.relnamespace
      WHERE c.relowner = r.oid
        OR (c.relkind IN ('r', 'v', 'm', 'p', 'f')
          AND (has_table_privilege(c.oid, 'DELETE, TRUNCATE, TRIGGER')
            OR has_any_column_privilege(c.oid, 'INSERT, UPDATE')))
        OR (c.relkind = 'S' AND has_sequence_privilege(c.oid, 'USAGE, UPDATE'))
      ORDER BY 1
    ) AS write_schemas
  FROM pg_roles r
  WHERE r.rolname = current_user`

/** What makes a role unsafe for serving caller SQL; empty for the provisioned query role. */
export function queryRoleProblems(attrs: QueryRoleAttributes): string[] {
  const problems: string[] = []
  // A login other than the query role means the server holds other credentials,
  // even when the session has switched to the query role.
  if (attrs.login !== QUERY_ROLE) problems.push(`logged in as "${attrs.login}", not ${QUERY_ROLE}`)
  else if (attrs.role !== QUERY_ROLE) problems.push(`queries run as "${attrs.role}", not ${QUERY_ROLE}`)
  if (attrs.rolsuper) problems.push("superuser")
  if (attrs.rolcreaterole) problems.push("CREATEROLE")
  if (attrs.rolcreatedb) problems.push("CREATEDB")
  if (attrs.rolreplication) problems.push("REPLICATION")
  if (attrs.rolbypassrls) problems.push("BYPASSRLS")
  if (attrs.db_create) problems.push("CREATE on the database")
  if (attrs.db_temp) problems.push("TEMPORARY on the database")
  if (attrs.member_of.length > 0) problems.push(`member of ${attrs.member_of.join(", ")}`)
  if (attrs.create_schemas.length > 0) problems.push(`CREATE on schema ${attrs.create_schemas.join(", ")}`)
  if (attrs.usage_schemas.length > 0) problems.push(`USAGE on schema ${attrs.usage_schemas.join(", ")}`)
  const unexpectedReadableRelations = attrs.read_relations.filter(
    (relation) =>
      !relation.startsWith("public.") ||
      !relation.endsWith(":v") ||
      !Object.hasOwn(TABLES, relation.slice("public.".length, -2)),
  )
  if (unexpectedReadableRelations.length > 0) problems.push(`can read relations ${unexpectedReadableRelations.join(", ")}`)
  if (attrs.invalid_public_views.length > 0) {
    problems.push(`untrusted public views ${attrs.invalid_public_views.join(", ")}`)
  }
  if (attrs.write_schemas.length > 0) problems.push(`owns or can modify relations in ${attrs.write_schemas.join(", ")}`)
  return problems
}

function jsonRowBytes(row: Record<string, unknown>): number {
  try {
    return Buffer.byteLength(JSON.stringify(row))
  } catch {
    throw new InputError("Query result contains an unsupported value.")
  }
}

function assertResultSize(
  responsePrefixBytes: number,
  rowCount: number,
  rowBytes: number,
  truncated: boolean,
  metrics?: SqlSizeMetrics,
): number {
  const metadata = truncated ? `,"truncated":true,"message":"Results capped at ${MAX_ROWS} rows."` : ""
  const byteCount = responsePrefixBytes + rowBytes +
    Buffer.byteLength(`],"rowCount":${rowCount}${metadata}}`, "utf8")
  if (byteCount > MAX_RESULT_BYTES) {
    if (metrics) metrics.limitHit = "result_bytes"
    throw new InputError(`Query result exceeds the ${MAX_RESULT_BYTES}-byte limit. Add filters or select fewer columns.`)
  }
  return byteCount
}

class ResultAccumulator {
  readonly columns: string[]
  private readonly responsePrefixBytes: number
  readonly rows: Record<string, unknown>[] = []
  private rowBytes = 0

  constructor(fields: readonly pg.FieldDef[]) {
    this.columns = fields.map(field => field.name)
    this.responsePrefixBytes = Buffer.byteLength(`{"columns":${JSON.stringify(this.columns)},"rows":[`)
  }

  add(values: readonly unknown[], metrics?: SqlSizeMetrics): void {
    const row = Object.create(null) as Record<string, unknown>
    for (let index = 0; index < this.columns.length; index++) {
      const value = values[index]
      row[this.columns[index]] = typeof value === "bigint" ? String(value) : value
    }
    const bytes = jsonRowBytes(row)
    if (metrics) metrics.maxRowBytes = Math.max(metrics.maxRowBytes ?? 0, bytes)
    this.rowBytes += (this.rows.length === 0 ? 0 : 1) + bytes
    assertResultSize(this.responsePrefixBytes, this.rows.length + 1, this.rowBytes, false, metrics)
    this.rows.push(row)
  }

  finish(truncated: boolean, metrics?: SqlSizeMetrics): SqlResult {
    const resultBytes = assertResultSize(this.responsePrefixBytes, this.rows.length, this.rowBytes, truncated, metrics)
    if (metrics) {
      metrics.maxRowBytes ??= 0
      metrics.resultBytes = resultBytes
    }
    return {
      columns: this.columns,
      rows: this.rows,
      rowCount: this.rows.length,
      ...(truncated ? { truncated: true, message: `Results capped at ${MAX_ROWS} rows.` } : {}),
    }
  }
}

function buildBoundedResult(
  fields: readonly pg.FieldDef[],
  sourceRows: readonly unknown[][],
  metrics?: SqlSizeMetrics,
): SqlResult {
  if (sourceRows.length > MAX_ROWS) {
    if (metrics) metrics.limitHit = "explain_rows"
    throw new InputError(`EXPLAIN result exceeds the ${MAX_ROWS}-row limit. Simplify the query.`)
  }

  const result = new ResultAccumulator(fields)
  for (const sourceRow of sourceRows) result.add(sourceRow, metrics)
  return result.finish(false, metrics)
}

function cursorSql(sql: string): string {
  return `DECLARE _foc_cursor NO SCROLL CURSOR FOR (
    SELECT _foc_result.*
    FROM (${sql}
    ) AS _foc_result
    WHERE (CASE
      WHEN pg_catalog.octet_length(ROW(_foc_result.*)::text) <= ${MAX_PG_ROW_BYTES} THEN 'true'
      ELSE 'foc_observer_row_limit'
    END)::pg_catalog.bool
  )`
}

function isRowLimitError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false
  const pgError = err as { code?: unknown; message?: unknown }
  return pgError.code === "22P02" && typeof pgError.message === "string" &&
    pgError.message.includes("foc_observer_row_limit")
}

export class PonderClient {
  readonly network: NetworkConfig
  private queryPool: pg.Pool

  constructor(network: NetworkConfig) {
    if (!network.queryDatabaseUrl) {
      throw new Error(
        `FOC_${network.name.toUpperCase()}_QUERY_DATABASE_URL is not set. Point it at the restricted ${QUERY_ROLE} role.`,
      )
    }
    this.network = network
    this.queryPool = new pg.Pool({
      connectionString: network.queryDatabaseUrl,
      max: POOL_SIZE,
      connectionTimeoutMillis: 2_000,
      statement_timeout: 30_000,
    })
    // pg-pool handles idle client errors; checked-out clients emit on their own.
    const checkedOutError = (error: Error) => logBackendError("postgres", "connection", error, network.name)
    this.queryPool.on("acquire", client => client.on("error", checkedOutError))
    this.queryPool.on("release", (_err, client) => client.removeListener("error", checkedOutError))
    this.queryPool.on("error", error => logBackendError("postgres", "idle_connection", error, network.name))
  }

  /** The connected query role and anything that makes it unsafe for serving caller SQL. */
  async checkQueryRole(): Promise<{ role: string; problems: string[] }> {
    const { rows } = await this.queryPool.query(QUERY_ROLE_SQL)
    const attrs = rows[0] as QueryRoleAttributes | undefined
    if (!attrs) throw new Error("The query role is missing from pg_roles.")
    return { role: attrs.role, problems: queryRoleProblems(attrs) }
  }

  /** @deprecated Use validateSql from sql-validator.ts directly */
  static validateSql = validateSql

  static readonly MAX_ROWS = MAX_ROWS

  /**
   * Server-side query. Passes the same validator as caller SQL; values travel as
   * bound parameters ($1, $2, ...), never as query text. Unlike querySql there is
   * no row cap.
   */
  async queryInternal(rawSql: string, params: ReadonlyArray<string | number | null> = []): Promise<SqlResult> {
    const { sql } = validateSql(rawSql)
    const client = await this.acquire()
    try {
      await client.query("BEGIN TRANSACTION READ ONLY")
      await client.query("SET LOCAL search_path TO public")
      const result = await client.query(sql, [...params])
      await client.query("COMMIT")
      const columns = result.fields.map((f) => f.name)
      const rows = result.rows as Record<string, unknown>[]
      for (const row of rows) {
        for (const col of columns) {
          if (typeof row[col] === "bigint") row[col] = String(row[col])
        }
      }
      return { columns, rows, rowCount: rows.length }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  private async acquire(): Promise<pg.PoolClient> {
    // pg enqueues synchronously in connect(); admit at most one waiting wave per network.
    if (this.queryPool.waitingCount >= POOL_SIZE) throw new ServiceUnavailableError("Database busy. Retry later.")
    const queued = this.queryPool.idleCount === 0 && this.queryPool.totalCount >= POOL_SIZE
    try {
      return await this.queryPool.connect()
    } catch (cause) {
      throw new ServiceUnavailableError(queued ? "Database busy. Retry later." : "Database unavailable. Retry later.", { cause })
    }
  }

  private async queryRaw(sql: string, params?: string[]): Promise<pg.QueryResult> {
    const client = await this.acquire()
    try {
      return await client.query(sql, params)
    } finally {
      client.release()
    }
  }

  async querySql(rawSql: string, metrics?: SqlSizeMetrics): Promise<SqlResult> {
    if (metrics) {
      delete metrics.resultBytes
      delete metrics.maxRowBytes
      delete metrics.limitHit
    }
    // sql is normalized (trailing semicolons stripped) for the cursor wrapper.
    const { isExplain, sql } = validateSql(rawSql)
    const client = await this.acquire()
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      // Limit multi-fetch transactions, but let a single slow statement cancel first.
      await client.query("SET LOCAL transaction_timeout = '60s'")
      await client.query("SET LOCAL search_path TO public")

      if (isExplain) {
        // EXPLAIN is a utility statement and PostgreSQL cannot declare a cursor
        // for it. Validate its complete result before committing so callers
        // receive either a plan or a size error, never a partial plan.
        const result = await client.query({ text: sql, rowMode: "array" })
        const response = buildBoundedResult(result.fields, result.rows, metrics)
        await client.query("COMMIT")
        return response
      }

      await client.query(cursorSql(sql))
      let result: ResultAccumulator | undefined
      let truncated = false

      while ((result?.rows.length ?? 0) < MAX_ROWS) {
        const count = Math.min(FETCH_BATCH_ROWS, MAX_ROWS - (result?.rows.length ?? 0))
        const fetched = await client.query({ text: `FETCH ${count} FROM _foc_cursor`, rowMode: "array" })
        if (!result) result = new ResultAccumulator(fetched.fields)
        if (fetched.rows.length === 0) break

        for (const values of fetched.rows) result.add(values, metrics)
      }
      if (result?.rows.length === MAX_ROWS) {
        try {
          truncated = (await client.query("MOVE FORWARD 1 FROM _foc_cursor")).rowCount === 1
        } catch (err) {
          // The guard found a row beyond the cap. Its contents are not part of the result.
          if (!isRowLimitError(err)) throw err
          truncated = true
        }
      }

      // Also closes the cursor if the lookahead hit the row-size guard.
      await client.query("ROLLBACK")
      return (result ?? new ResultAccumulator([])).finish(truncated, metrics)
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {})
      if (isRowLimitError(err)) {
        if (metrics) metrics.limitHit = "pg_row"
        throw new InputError(`Query result row exceeds the ${MAX_PG_ROW_BYTES}-byte limit. Select fewer columns or smaller values.`)
      }
      if (typeof err === "object" && err !== null && "code" in err) {
        switch (err.code) {
          case "42703": throw new InputError("Unknown column. Use describe_table to check its name.")
          case "42702": throw new InputError("Ambiguous column. Qualify it with a table alias.")
          case "42803": throw new InputError("Invalid grouping. Group or aggregate every selected column.")
          case "42883": throw new InputError("Unknown function or operator for these argument types.")
          case "42P01": throw new InputError("Unknown table or CTE. Use list_tables to check table names.")
          case "22012": throw new InputError("Division by zero.")
          case "22003": throw new InputError("Numeric value is out of range.")
          case "22007": throw new InputError("Invalid date or time value.")
          case "22008": throw new InputError("Date or time value is out of range.")
          case "2201B": throw new InputError("Invalid regular expression.")
          case "22025": throw new InputError("Invalid escape sequence.")
          case "2201X":
          case "2201W": throw new InputError("Invalid row count in LIMIT or OFFSET.")
          case "21000": throw new InputError("A subquery returned more than one row. Use an aggregate, LIMIT 1, or a query that returns one row.")
          case "57014": throw new InputError("Query canceled. Narrow the query and retry.")
          case "22P02": throw new InputError("Invalid value for the requested SQL type.")
        }
      }
      throw err
    } finally {
      client.release()
    }
  }

  async listTables(): Promise<TableInfo[]> {
    // rowCount is a planner estimate, not COUNT(*): public holds views over the
    // data_v* schema, so read pg_class.reltuples, resolved via pg_rewrite/pg_depend
    // to the backing table(s) for views (MAX across a join).
    const result = await this.queryRaw(`
      SELECT rel.relname AS name,
        rel.relkind AS kind,
        CASE WHEN rel.relkind = 'r' THEN GREATEST(rel.reltuples, 0)::bigint
             ELSE COALESCE((
               SELECT MAX(GREATEST(t.reltuples, 0))::bigint
               FROM pg_rewrite rw
               JOIN pg_depend d ON d.objid = rw.oid
                 AND d.refclassid = 'pg_class'::regclass AND d.deptype = 'n'
               JOIN pg_class t ON t.oid = d.refobjid AND t.relkind = 'r'
               WHERE rw.ev_class = rel.oid
             ), 0) END AS row_estimate
      FROM pg_class rel
      JOIN pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
      WHERE rel.relkind IN ('r', 'v')
      ORDER BY rel.relname
    `)

    const tables: TableInfo[] = []
    for (const row of result.rows as Record<string, unknown>[]) {
      const name = row.name as string
      if (!Object.hasOwn(TABLES, name)) continue

      const rowCount = Number((row as Record<string, unknown>).row_estimate ?? 0)
      const isView = (row.kind as string) === "v"
      const desc = TABLES[name]?.description ?? (isView ? "(view)" : "")
      tables.push({ name, rowCount, description: desc })
    }

    return tables
  }

  async describeTable(tableName: string): Promise<ColumnInfo[]> {
    if (!Object.hasOwn(TABLES, tableName)) return []
    const result = await this.queryRaw(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    )

    const notes = columnNotes(tableName)
    return result.rows.map((row: Record<string, unknown>) => ({
      name: row.column_name as string,
      type: row.data_type as string,
      nullable: row.is_nullable === "YES",
      note: notes.get(row.column_name as string),
    }))
  }

  async getStatus(): Promise<{
    network: string
    tables: number
    totalRows: number
    reachable: boolean
    error?: string
  }> {
    try {
      const tables = await this.listTables()
      const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0)
      return {
        network: this.network.name,
        tables: tables.length,
        totalRows,
        reachable: true,
      }
    } catch (err) {
      logBackendError("postgres", "status", err, this.network.name)
      return {
        network: this.network.name,
        tables: 0,
        totalRows: 0,
        reachable: false,
        error: "Database unavailable.",
      }
    }
  }

  async close(): Promise<void> {
    await this.queryPool.end()
  }
}
