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

// Server-created views (bootstrapViews below), not in schema-defs TABLES.
const VIEW_DESCRIPTIONS: Record<string, string> = {
  tx_meta:
    "One row per transaction: tx_from, tx_value, gas_used, effective_gas_price, tx_to, tx_selector, status. Event tables carry only tx_hash; JOIN tx_meta USING (tx_hash) for sender/value/gas. Gas cost in FIL = gas_used * effective_gas_price / 1e18",
}

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
    // Hash index is the only entry point into tx_meta by tx_hash; ponder_sync
    // tables are keyed (chain_id, block_number, transaction_index) and a JOIN
    // by hash seq-scans millions of rows without it. USING hash: equality-only
    // and far smaller than a btree over 66-char hex strings. ~10s to build on
    // 15M rows, no-op after the first run.
    const indexDdl = `
      CREATE INDEX IF NOT EXISTS transactions_hash_hash_idx
        ON ponder_sync.transactions USING hash (hash)
    `
    // CREATE OR REPLACE VIEW only permits appending columns, not reordering or
    // renaming. New columns must go at the end of the SELECT list.
    // Receipts and blocks join via the ponder_sync primary keys; only the
    // transactions lookup needs the hash index above.
    const viewDdl = `
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
        ON r.chain_id = t.chain_id
        AND r.block_number = t.block_number
        AND r.transaction_index = t.transaction_index
      JOIN ponder_sync.blocks b
        ON b.chain_id = t.chain_id AND b.number = t.block_number
    `
    try {
      await this.queryRaw(indexDdl)
      await this.queryRaw(viewDdl)
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
    // rowCount is a planner estimate, not COUNT(*). public holds views over the
    // data_v* schema; an exact count of tx_meta (a join over millions of
    // transactions) is too slow for /status. Use pg_class.reltuples, resolved
    // via pg_rewrite/pg_depend to the backing table(s) for views (MAX across a
    // join, so tx_meta reports its tx count).
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
      const desc = TABLES[name]?.description ?? VIEW_DESCRIPTIONS[name] ?? (isView ? "(view)" : "")
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
