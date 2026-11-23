/**
 * Client for querying Ponder-indexed FOC data.
 * SQL queries go directly to Postgres in a READ ONLY transaction.
 * Validation is handled by sql-validator.ts (libpg-query AST allow-list).
 */

import pg from "pg"
import type { NetworkConfig } from "./networks.js"
import { validateSql, MAX_ROWS } from "./sql-validator.js"
import { columnNotes } from "./table-metadata.js"

export interface SqlResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
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
  /** Schemas holding a relation the role owns or can write to, at table or column level. */
  write_schemas: string[]
}

const QUERY_ROLE_SQL = `
  WITH app_schemas AS (
    SELECT oid, nspname FROM pg_namespace
    WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
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
  if (attrs.write_schemas.length > 0) problems.push(`owns or can modify relations in ${attrs.write_schemas.join(", ")}`)
  return problems
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
      max: 12,
      statement_timeout: 30_000,
    })
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
    const client = await this.queryPool.connect()
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

  /** Internal query, bypasses validation, used by listTables/describeTable */
  private async queryRaw(sql: string): Promise<pg.QueryResult> {
    const client = await this.queryPool.connect()
    try {
      const result = await client.query(sql)
      return result
    } finally {
      client.release()
    }
  }

  async querySql(rawSql: string): Promise<SqlResult> {
    // sql is normalized (trailing semicolons stripped) for the cursor wrapper.
    const { isExplain, sql } = validateSql(rawSql)

    const client = await this.queryPool.connect()
    try {
      await client.query("BEGIN TRANSACTION READ ONLY")
      await client.query("SET LOCAL search_path TO public")

      let result: pg.QueryResult

      if (isExplain) {
        // EXPLAIN returns a query plan, not data rows. No cursor needed
        // (and DECLARE CURSOR FOR EXPLAIN is a Postgres syntax error).
        result = await client.query(sql)
      } else {
        // Use a cursor to cap memory usage. Without this, a query returning
        // millions of rows would buffer everything in Node.js memory before we
        // could truncate. The cursor fetches at most MAX_ROWS + 1 rows from
        // Postgres, detecting truncation without unbounded allocation.
        const fetchLimit = MAX_ROWS + 1
        await client.query(`DECLARE _foc_cursor NO SCROLL CURSOR FOR (${sql})`)
        result = await client.query(`FETCH ${fetchLimit} FROM _foc_cursor`)
        await client.query("CLOSE _foc_cursor")
      }

      await client.query("COMMIT")

      const columns = result.fields.map((f) => f.name)
      let rows = result.rows as Record<string, unknown>[]
      const truncated = !isExplain && rows.length > MAX_ROWS
      if (truncated) {
        rows = rows.slice(0, MAX_ROWS)
      }

      for (const row of rows) {
        for (const col of columns) {
          if (typeof row[col] === "bigint") {
            row[col] = String(row[col])
          }
        }
      }

      return {
        columns,
        rows,
        rowCount: rows.length,
        ...(truncated ? { truncated: true, message: `Results capped at ${MAX_ROWS} rows.` } : {}),
      } as SqlResult
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {})
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
      if (name.startsWith("_ponder") || name.startsWith("ponder_") || name.startsWith("_reorg__")) continue

      const rowCount = Number((row as Record<string, unknown>).row_estimate ?? 0)
      const isView = (row.kind as string) === "v"
      const desc = TABLES[name]?.description ?? (isView ? "(view)" : "")
      tables.push({ name, rowCount, description: desc })
    }

    return tables
  }

  async describeTable(tableName: string): Promise<ColumnInfo[]> {
    const result = await this.queryPool.query(
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
      return {
        network: this.network.name,
        tables: 0,
        totalRows: 0,
        reachable: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async close(): Promise<void> {
    await this.queryPool.end()
  }
}
