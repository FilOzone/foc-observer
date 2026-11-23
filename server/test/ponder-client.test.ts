/**
 * Offline unit tests for PonderClient query pipeline.
 * Uses a mocked pg.Pool, no Postgres needed.
 */

import { EventEmitter } from "node:events"
import { describe, expect, test, vi, beforeAll, beforeEach } from "vitest"
import { getNetworkConfig } from "../src/networks.js"
import { InputError } from "../src/inputs.js"
import { initParser, MAX_ROWS } from "../src/sql-validator.js"
import { MAX_PG_ROW_BYTES, MAX_RESULT_BYTES, type SqlSizeMetrics } from "../src/ponder-client.js"

beforeAll(async () => {
  await initParser()
})

const mockQuery = vi.fn()
const mockRelease = vi.fn()
const poolConnectionStrings: string[] = []

vi.mock("pg", () => {
  return {
    default: {
      Pool: class MockPool extends EventEmitter {
        constructor(options: { connectionString: string }) {
          super()
          poolConnectionStrings.push(options.connectionString)
        }
        connect() {
          return Promise.resolve({ query: mockQuery, release: mockRelease })
        }
        query(...args: unknown[]) {
          return mockQuery(...args)
        }
        end() {
          return Promise.resolve()
        }
      },
    },
  }
})

// Import after mock is set up
const { PonderClient, queryRoleProblems } = await import("../src/ponder-client.js")

const QUERY_URL = "postgres://foc_observer_query@database/ponder"
const QUERY_CONFIG = getNetworkConfig("calibnet", { queryDatabaseUrl: QUERY_URL })

/** Set up a cursor pipeline that returns exactly the number of rows requested. */
function mockCursorQuery(fields: Array<{ name: string }>, rows: unknown[][]) {
  let offset = 0
  mockQuery
    .mockResolvedValueOnce({}) // BEGIN TRANSACTION ...
    .mockResolvedValueOnce({}) // SET LOCAL transaction_timeout
    .mockResolvedValueOnce({}) // SET LOCAL search_path
    .mockResolvedValueOnce({}) // DECLARE _foc_cursor ...
    .mockImplementation(async (query: unknown) => {
      if (typeof query === "object" && query !== null && "text" in query) {
        const count = Number(/^FETCH (\d+) FROM _foc_cursor$/.exec(String(query.text))?.[1])
        const batch = rows.slice(offset, offset + count)
        offset += batch.length
        return { fields, rows: batch }
      }
      if (query === "MOVE FORWARD 1 FROM _foc_cursor") return { rowCount: Number(offset < rows.length) }
      return {}
    })
}

function rowsForWireBudget(bytes: number): unknown[][] {
  const count = 5
  const empty = { columns: ["source"], rows: Array.from({ length: count }, () => ({ source: "" })), rowCount: count }
  let remaining = bytes - Buffer.byteLength(JSON.stringify(empty), "utf8")
  return Array.from({ length: count }, (_, index) => {
    const length = Math.floor(remaining / (count - index))
    remaining -= length
    return ["x".repeat(length)]
  })
}

describe("PonderClient.querySql", () => {
  let client: InstanceType<typeof PonderClient>

  beforeEach(() => {
    mockQuery.mockReset()
    mockRelease.mockReset()
    poolConnectionStrings.length = 0
    client = new PonderClient(QUERY_CONFIG)
  })

  test("connects with the query database URL", () => {
    expect(poolConnectionStrings).toEqual([QUERY_URL])
  })

  test("requires a query database URL", () => {
    expect(() => new PonderClient({ ...QUERY_CONFIG, queryDatabaseUrl: undefined })).toThrow(/FOC_CALIBNET_QUERY_DATABASE_URL is not set/)
  })

  test("fetches bounded batches through a guarded cursor", async () => {
    mockCursorQuery([{ name: "x" }], [[1]])

    await client.querySql("SELECT 1 as x")

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("pg_catalog.octet_length"))
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringMatching(/^FETCH \d+ FROM _foc_cursor$/),
      rowMode: "array",
    }))
    expect(mockRelease).toHaveBeenCalled()
  })

  test("keeps cursor wrapper syntax after a trailing line comment", async () => {
    mockCursorQuery([{ name: "x" }], [[1]])

    await client.querySql("SELECT 1 AS x -- trailing comment")

    expect(String(mockQuery.mock.calls[3][0])).toContain("-- trailing comment\n")
  })

  test("converts bigint values to strings", async () => {
    mockCursorQuery([{ name: "amount" }], [[1000000000000000000n]])

    const result = await client.querySql("SELECT 1e18 as amount")
    expect(result.rows[0].amount).toBe("1000000000000000000")
    expect(typeof result.rows[0].amount).toBe("string")
  })

  test("truncates results beyond MAX_ROWS", async () => {
    mockCursorQuery([{ name: "id" }], Array.from({ length: MAX_ROWS + 1 }, (_, id) => [id]))

    const result = await client.querySql("SELECT id FROM fp_deposit")
    expect(result.rowCount).toBe(MAX_ROWS)
    expect(result.truncated).toBe(true)
  })

  test("accepts a 2 MiB row and reports its serialized size", async () => {
    const value = "x".repeat(2 * 1_024 * 1_024)
    mockCursorQuery([{ name: "source" }], [[value]])

    const metrics: SqlSizeMetrics = {}
    const result = await client.querySql("SELECT source FROM fwss_data_set_created", metrics)

    expect(result.rows).toEqual([{ source: value }])
    expect(metrics).toMatchObject({
      resultBytes: Buffer.byteLength(JSON.stringify(result), "utf8"),
      maxRowBytes: Buffer.byteLength(JSON.stringify(result.rows[0]), "utf8"),
    })
  })

  test("accepts five rows exactly at the wire budget", async () => {
    mockCursorQuery([{ name: "source" }], rowsForWireBudget(MAX_RESULT_BYTES))

    const metrics: SqlSizeMetrics = {}
    const result = await client.querySql("SELECT source FROM fwss_data_set_created", metrics)
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBe(MAX_RESULT_BYTES)
    expect(metrics.resultBytes).toBe(MAX_RESULT_BYTES)
  })

  test("rejects five rows one byte beyond the total wire budget", async () => {
    mockCursorQuery([{ name: "source" }], rowsForWireBudget(MAX_RESULT_BYTES + 1))

    const metrics: SqlSizeMetrics = {}
    await expect(client.querySql("SELECT source FROM fwss_data_set_created", metrics)).rejects.toThrow(/result exceeds/)
    expect(metrics.limitHit).toBe("result_bytes")
    expect(MAX_RESULT_BYTES).toBeGreaterThan(MAX_PG_ROW_BYTES)
    expect(mockQuery).toHaveBeenLastCalledWith("ROLLBACK")
  })

  test("measures escaped multibyte rows in UTF-8 bytes", async () => {
    const value = "é\n"
    mockCursorQuery([{ name: "source" }], [[value]])

    const metrics: SqlSizeMetrics = {}
    const result = await client.querySql("SELECT source FROM fwss_data_set_created", metrics)

    expect(metrics.maxRowBytes).toBe(Buffer.byteLength(JSON.stringify(result.rows[0]), "utf8"))
  })

  test("reports the PostgreSQL row guard as a limit hit", async () => {
    const sql = "SELECT source FROM fwss_data_set_created"
    mockQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET transaction timeout
      .mockResolvedValueOnce({}) // SET search path
      .mockResolvedValueOnce({}) // DECLARE guarded cursor
      .mockRejectedValueOnce({ code: "22P02", message: 'invalid input syntax for type boolean: "foc_observer_row_limit"' })
      .mockResolvedValueOnce({}) // ROLLBACK

    const metrics: SqlSizeMetrics = {}
    await expect(client.querySql(sql, metrics)).rejects.toBeInstanceOf(InputError)
    expect(metrics.limitHit).toBe("pg_row")
    expect(mockQuery).toHaveBeenLastCalledWith("ROLLBACK")
  })

  test("does not set truncated flag for small results", async () => {
    mockCursorQuery([{ name: "id" }], [[1]])

    const result = await client.querySql("SELECT 1 as id")
    expect(result.rowCount).toBe(1)
    expect(result.truncated).toBeUndefined()
  })

  test("rejects invalid SQL before querying", async () => {
    await expect(client.querySql("DROP TABLE foo")).rejects.toThrow(/Only SELECT/)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  test("rolls back on query error", async () => {
    mockQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET transaction timeout
      .mockResolvedValueOnce({}) // SET search path
      .mockRejectedValueOnce(new Error("syntax error")) // DECLARE fails
      .mockResolvedValueOnce({}) // ROLLBACK
    await expect(client.querySql("SELECT bad syntax")).rejects.toThrow("syntax error")
    expect(mockQuery).toHaveBeenLastCalledWith("ROLLBACK")
    expect(mockRelease).toHaveBeenCalled()
  })

  test.each([
    ["21000", "A subquery returned more than one row. Use an aggregate, LIMIT 1, or a query that returns one row."],
    ["22007", "Invalid date or time value."],
    ["22008", "Date or time value is out of range."],
    ["2201B", "Invalid regular expression."],
    ["57014", "Query canceled. Narrow the query and retry."],
  ])("maps SQLSTATE %s to a locally authored input error", async (code, message) => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ code, message: "driver diagnostic with secret query content" })
      .mockResolvedValueOnce({})

    await expect(client.querySql("SELECT 1")).rejects.toMatchObject({ message })
  })

  test("preserves ordinary query columns and aggregate values", async () => {
    mockCursorQuery(
      [{ name: "rail_id" }, { name: "settlement_count" }],
      [[1, 100]],
    )

    const result = await client.querySql(
      "SELECT rail_id, COUNT(*) AS settlement_count FROM fp_rail_settled GROUP BY rail_id",
    )
    expect(result.columns).toEqual(["rail_id", "settlement_count"])
    expect(result.rows).toEqual([{ rail_id: 1, settlement_count: 100 }])
  })

  test("preserves duplicate and hostile aliases in column metadata", async () => {
    mockCursorQuery(
      [{ name: "same" }, { name: "same" }, { name: "x; DROP TABLE" }],
      [[1, 2, 3]],
    )

    const result = await client.querySql('SELECT 1 AS "same", 2 AS "same", 3 AS "x; DROP TABLE"')
    expect(result.columns).toEqual(["same", "same", "x; DROP TABLE"])
    expect(result.rows).toEqual([{ same: 2, "x; DROP TABLE": 3 }])
  })

  test("EXPLAIN uses direct execution, not cursor", async () => {
    mockQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET transaction timeout
      .mockResolvedValueOnce({}) // SET search path
      .mockResolvedValueOnce({ // EXPLAIN result (direct query, no cursor)
        fields: [{ name: "QUERY PLAN" }],
        rows: [["Seq Scan on fp_deposit (cost=0.00..1.00 rows=1 width=32)"]],
      })
      .mockResolvedValueOnce({}) // COMMIT

    const result = await client.querySql("EXPLAIN SELECT * FROM fp_deposit")

    expect(result.columns).toEqual(["QUERY PLAN"])
    expect(result.rows).toHaveLength(1)
    // Should NOT have DECLARE/FETCH/CLOSE calls
    expect(mockQuery).toHaveBeenCalledTimes(5)
    expect(mockQuery).toHaveBeenNthCalledWith(4, { text: "EXPLAIN SELECT * FROM fp_deposit", rowMode: "array" })
  })

  test("applies the total wire budget to EXPLAIN", async () => {
    mockQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET transaction timeout
      .mockResolvedValueOnce({}) // SET search path
      .mockResolvedValueOnce({
        fields: [{ name: "QUERY PLAN" }],
        rows: [["x".repeat(MAX_RESULT_BYTES)]],
      })
      .mockResolvedValueOnce({}) // ROLLBACK

    const metrics: SqlSizeMetrics = {}
    await expect(client.querySql("EXPLAIN SELECT * FROM fp_deposit", metrics)).rejects.toThrow(/result exceeds/)
    expect(metrics.limitHit).toBe("result_bytes")
    expect(mockQuery).toHaveBeenLastCalledWith("ROLLBACK")
  })

  test("reports an EXPLAIN row cap", async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        fields: [{ name: "QUERY PLAN" }],
        rows: Array.from({ length: MAX_ROWS + 1 }, () => ["plan"]),
      })
      .mockResolvedValueOnce({})

    const metrics: SqlSizeMetrics = {}
    await expect(client.querySql("EXPLAIN SELECT * FROM fp_deposit", metrics)).rejects.toThrow(/row limit/)
    expect(metrics.limitHit).toBe("explain_rows")
  })
})

describe("PonderClient.queryInternal", () => {
  let client: InstanceType<typeof PonderClient>

  beforeEach(() => {
    mockQuery.mockReset()
    mockRelease.mockReset()
    client = new PonderClient(QUERY_CONFIG)
  })

  test("binds params inside a read-only transaction", async () => {
    mockQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET
      .mockResolvedValueOnce({ fields: [{ name: "set_id" }], rows: [{ set_id: 42n }] })
      .mockResolvedValueOnce({}) // COMMIT

    const sql = "SELECT set_id FROM pdp_data_set_created WHERE set_id = $1"
    const result = await client.queryInternal(sql, ["42"])

    expect(mockQuery).toHaveBeenNthCalledWith(1, "BEGIN TRANSACTION READ ONLY")
    expect(mockQuery).toHaveBeenNthCalledWith(3, sql, ["42"])
    expect(result.rows).toEqual([{ set_id: "42" }])
  })

  test("rejects SQL the validator rejects, before touching the pool", async () => {
    await expect(client.queryInternal("SELECT * FROM pg_roles")).rejects.toThrow(/not a known FOC event table/)
    await expect(client.queryInternal("SELECT 1; SELECT 2")).rejects.toThrow(/Multiple statements/)
    await expect(client.queryInternal("SELECT pg_read_file('/etc/passwd')")).rejects.toThrow(/not allowed/)
    expect(mockQuery).not.toHaveBeenCalled()
  })
})

describe("query role check", () => {
  const RESTRICTED = {
    login: "foc_observer_query",
    role: "foc_observer_query",
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolbypassrls: false,
    db_create: false,
    db_temp: false,
    member_of: [],
    create_schemas: [],
    usage_schemas: [],
    read_relations: [],
    invalid_public_views: [],
    write_schemas: [],
  }

  test("the provisioned role has no problems", () => {
    expect(queryRoleProblems(RESTRICTED)).toEqual([])
  })

  test("reports each privilege", () => {
    expect(queryRoleProblems({
      login: "ponder",
      role: "ponder",
      rolsuper: true,
      rolcreaterole: true,
      rolcreatedb: true,
      rolreplication: true,
      rolbypassrls: true,
      db_create: true,
      db_temp: true,
      member_of: ["pg_monitor", "pg_read_server_files"],
      create_schemas: ["public"],
      usage_schemas: ["data_v3", "ponder_sync"],
      read_relations: ["public.fp_deposit:v"],
      invalid_public_views: ["fp_deposit"],
      write_schemas: ["data_v3", "public"],
    })).toEqual([
      'logged in as "ponder", not foc_observer_query',
      "superuser",
      "CREATEROLE",
      "CREATEDB",
      "REPLICATION",
      "BYPASSRLS",
      "CREATE on the database",
      "TEMPORARY on the database",
      "member of pg_monitor, pg_read_server_files",
      "CREATE on schema public",
      "USAGE on schema data_v3, ponder_sync",
      "untrusted public views fp_deposit",
      "owns or can modify relations in data_v3, public",
    ])
  })

  test("rejects a write grant outside public", () => {
    expect(queryRoleProblems({ ...RESTRICTED, write_schemas: ["data_v3"] })).toEqual([
      "owns or can modify relations in data_v3",
    ])
  })

  test("rejects a readable view Ponder did not publish", () => {
    expect(queryRoleProblems({ ...RESTRICTED, invalid_public_views: ["fp_deposit"] })).toEqual([
      "untrusted public views fp_deposit",
    ])
  })

  test("rejects an otherwise restricted role under another name", () => {
    expect(queryRoleProblems({ ...RESTRICTED, login: "reader", role: "reader" })).toEqual([
      'logged in as "reader", not foc_observer_query',
    ])
  })

  test("rejects a privileged login that switched to the query role", () => {
    expect(queryRoleProblems({ ...RESTRICTED, login: "ponder" })).toEqual(['logged in as "ponder", not foc_observer_query'])
  })

  test("checkQueryRole reads the connected role", async () => {
    mockQuery.mockReset()
    mockQuery.mockResolvedValueOnce({ rows: [{ ...RESTRICTED, usage_schemas: ["ponder_sync"] }] })
    const client = new PonderClient(QUERY_CONFIG)

    await expect(client.checkQueryRole()).resolves.toEqual({
      role: "foc_observer_query",
      problems: ["USAGE on schema ponder_sync"],
    })
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE r.rolname = current_user"))
  })
})
