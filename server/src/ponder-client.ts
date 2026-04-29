/**
 * Client for querying Ponder-indexed FOC data.
 * SQL queries go directly to Postgres in a READ ONLY transaction.
 * Validation is handled by sql-validator.ts (libpg-query AST allow-list).
 */

import pg from "pg"
import type { NetworkConfig } from "./networks.js"
import { validateSql, MAX_ROWS } from "./sql-validator.js"

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
      statement_timeout: 30_000,
    })
  }

  /** @deprecated Use validateSql from sql-validator.ts directly */
  static validateSql = validateSql

  static readonly MAX_ROWS = MAX_ROWS

  /** Internal query with SqlResult shape, bypasses validation, for server-side use only. */
  async queryInternal(sql: string): Promise<SqlResult> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN TRANSACTION READ ONLY")
      await client.query("SET LOCAL search_path TO public")
      const result = await client.query(sql)
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
    const client = await this.pool.connect()
    try {
      const result = await client.query(sql)
      return result
    } finally {
      client.release()
    }
  }

  /**
   * Create or refresh the read-only views we expose in the public schema for
   * agent queries. Called at server startup so the views always exist regardless
   * of whether the underlying postgres volume is fresh or carried over from a
   * previous indexing run.
   *
   * Tolerates the case where Ponder's internal sync tables don't exist yet
   * (e.g. fresh DB, ponder hasn't booted) — the view will be created on the
   * next server startup once Ponder has populated its schema.
   *
   * Currently exposes:
   * - tx_meta: per-tx target/selector/gas, joined from ponder_sync.transactions
   *   and ponder_sync.transaction_receipts. Allow-listed in sql-validator.ts.
   */
  async bootstrapViews(): Promise<void> {
    // CREATE OR REPLACE VIEW only permits appending columns, not reordering or
    // renaming. New columns must go at the end of the SELECT list.
    const ddl = `
      CREATE OR REPLACE VIEW public.tx_meta AS
      SELECT
        t.hash                AS tx_hash,
        t."to"                AS tx_to,
        LEFT(t.input, 10)     AS tx_selector,
        t."from"              AS tx_from,
        t.value               AS tx_value,
        t.block_number        AS block_number,
        r.gas_used            AS gas_used,
        r.effective_gas_price AS effective_gas_price,
        r.status              AS status,
        b.timestamp           AS timestamp
      FROM ponder_sync.transactions t
      JOIN ponder_sync.transaction_receipts r
        ON r.transaction_hash = t.hash AND r.chain_id = t.chain_id
      JOIN ponder_sync.blocks b
        ON b.number = t.block_number AND b.chain_id = t.chain_id
    `
    try {
      await this.queryRaw(ddl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Not fatal — Ponder may not have created its sync tables yet on a fresh
      // volume. The view will get created on the next server restart.
      console.warn(`[bootstrap-views] ${this.network.name}: skipped tx_meta (${msg})`)
    }
  }

  async querySql(sql: string): Promise<SqlResult> {
    const { isExplain } = validateSql(sql)

    const client = await this.pool.connect()
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
    // Tables and views in the public schema. Views (like tx_meta) are surfaced
    // alongside event tables so agents discover them via list_tables.
    const result = await this.queryRaw(`
      SELECT tablename AS name, 'table' AS kind FROM pg_catalog.pg_tables WHERE schemaname = 'public'
      UNION ALL
      SELECT viewname  AS name, 'view'  AS kind FROM pg_catalog.pg_views  WHERE schemaname = 'public'
      ORDER BY name
    `)

    const tables: TableInfo[] = []
    for (const row of result.rows as Record<string, unknown>[]) {
      const name = row.name as string
      const kind = row.kind as string
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

      const desc = TABLES[name]?.description ?? (kind === "view" ? "(view)" : "")
      tables.push({ name, rowCount, description: desc })
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
