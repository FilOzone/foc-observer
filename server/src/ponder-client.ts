/**
 * Client for querying Ponder-indexed FOC data.
 * SQL queries go directly to Postgres (more capable, no function whitelist).
 * GraphQL queries go to Ponder's HTTP API.
 */

import pg from "pg"
import type { NetworkConfig } from "./networks.js"

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
}

import { TABLES } from "./schema-defs.js"

export class PonderClient {
  readonly network: NetworkConfig
  private pool: pg.Pool

  constructor(network: NetworkConfig) {
    this.network = network
    this.pool = new pg.Pool({
      connectionString: network.databaseUrl,
      max: 5,
      statement_timeout: 120_000,
    })
  }

  static readonly MAX_ROWS = 10000

  static validateSql(sql: string): void {
    // Strip BOM and normalize whitespace
    const trimmed = sql.replace(/^\uFEFF/, "").trim().toUpperCase()

    // Block multiple statements (semicolons outside string literals)
    // Simple check: reject any semicolon. SQL queries don't need them for single statements.
    if (trimmed.includes(";")) {
      throw new Error("Multiple statements are not allowed. Remove semicolons.")
    }

    if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH") && !trimmed.startsWith("EXPLAIN")) {
      throw new Error("Only SELECT, WITH, and EXPLAIN queries are allowed.")
    }
    if (trimmed.startsWith("EXPLAIN") && trimmed.includes("ANALYZE")) {
      throw new Error("EXPLAIN ANALYZE is not allowed.")
    }

    // Block access to Postgres system catalogs, metadata views, and sensitive objects
    const blockedTerms = [
      // Auth and credentials
      "PG_SHADOW", "PG_AUTHID", "PG_AUTH_MEMBERS", "PG_ROLES", "PG_USER",
      "PG_GROUP", "PG_USER_MAPPING",
      // Server config and files
      "PG_SETTINGS", "PG_CONFIG", "PG_FILE_SETTINGS",
      "PG_HBA_FILE_RULES", "PG_IDENT_FILE_MAPPINGS",
      // System catalogs
      "PG_CATALOG", "INFORMATION_SCHEMA",
      "PG_DATABASE", "PG_TABLESPACE", "PG_EXTENSION", "PG_PROC",
      "PG_TABLES", "PG_VIEWS", "PG_INDEXES",
      // Runtime state
      "PG_STAT_ACTIVITY", "PG_STAT_SSL", "PG_STAT_GSSAPI",
      "PG_STAT_REPLICATION", "PG_STAT_WAL",
      "PG_LOCKS", "PG_PREPARED_STATEMENTS", "PG_CURSORS",
      // Shared memory (new in PG18)
      "PG_SHMEM_ALLOCATIONS",
      // Replication
      "PG_REPLICATION_ORIGIN", "PG_REPLICATION_SLOTS",
      // Large objects
      "PG_LARGEOBJECT",
    ]
    for (const term of blockedTerms) {
      if (trimmed.includes(term)) {
        throw new Error(`Access to ${term.toLowerCase()} is not allowed.`)
      }
    }

    // Block dangerous superuser functions
    const blockedFunctions = [
      "PG_READ_FILE", "PG_READ_BINARY_FILE", "PG_STAT_FILE",
      "PG_LS_DIR", "PG_LS_LOGDIR", "PG_LS_WALDIR", "PG_LS_TMPDIR",
      "LO_IMPORT", "LO_EXPORT", "LO_GET", "LO_PUT",
      "PG_TERMINATE_BACKEND", "PG_CANCEL_BACKEND", "PG_RELOAD_CONF",
      "COPY ", "SET ROLE", "SET SESSION",
      "PG_SLEEP",
    ]
    for (const fn of blockedFunctions) {
      if (trimmed.includes(fn)) {
        throw new Error(`Function ${fn.toLowerCase().trim()} is not allowed.`)
      }
    }
  }

  /** Internal query, bypasses validation, used by listTables/describeTable */
  private async queryRaw(sql: string): Promise<pg.QueryResult> {
    const client = await this.pool.connect()
    try {
      const result = await client.query(sql)
      return result
    } finally {
      client.release()
    }
  }

  async querySql(sql: string): Promise<SqlResult> {
    PonderClient.validateSql(sql)

    const client = await this.pool.connect()
    try {
      await client.query("BEGIN TRANSACTION READ ONLY")
      await client.query("SET LOCAL search_path TO public")
      const result = await client.query(sql)
      await client.query("COMMIT")

      const columns = result.fields.map((f) => f.name)
      let rows = result.rows as Record<string, unknown>[]
      const totalRows = rows.length
      const truncated = totalRows > PonderClient.MAX_ROWS
      if (truncated) {
        rows = rows.slice(0, PonderClient.MAX_ROWS)
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
        ...(truncated ? { truncated: true, totalRows } : {}),
      } as SqlResult
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  async listTables(): Promise<TableInfo[]> {
    const result = await this.queryRaw(`
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `)

    const tables: TableInfo[] = []
    for (const row of result.rows as Record<string, unknown>[]) {
      const name = row.tablename as string
      if (name.startsWith("_ponder") || name.startsWith("ponder_") || name.startsWith("_reorg__")) continue

      let rowCount = 0
      try {
        const countResult = await this.queryRaw(
          `SELECT COUNT(*) as count FROM "${name}"`
        )
        rowCount = Number((countResult.rows[0] as Record<string, unknown>)?.count ?? 0)
      } catch {
        // Table might not be queryable
      }

      tables.push({
        name,
        rowCount,
        description: TABLES[name]?.description ?? "",
      })
    }

    return tables
  }

  async describeTable(tableName: string): Promise<ColumnInfo[]> {
    const result = await this.pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    )

    return result.rows.map((row: Record<string, unknown>) => ({
      name: row.column_name as string,
      type: row.data_type as string,
      nullable: row.is_nullable === "YES",
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
    await this.pool.end()
  }
}
