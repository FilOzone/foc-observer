/**
 * Offline unit tests for PonderClient query pipeline.
 * Uses a mocked pg.Pool, no Postgres needed.
 */

import { describe, expect, test, vi, beforeAll, beforeEach } from "vitest"
import { getNetworkConfig } from "../src/networks.js"
import { initParser, MAX_ROWS } from "../src/sql-validator.js"

beforeAll(async () => {
  await initParser()
})

const mockQuery = vi.fn()
const mockRelease = vi.fn()

vi.mock("pg", () => {
  return {
    default: {
      Pool: class MockPool {
        connect() {
          return Promise.resolve({ query: mockQuery, release: mockRelease })
        }
        end() {
          return Promise.resolve()
        }
      },
    },
  }
})

// Import after mock is set up
const { PonderClient } = await import("../src/ponder-client.js")

/** Set up mock for the 6-step cursor query pipeline: BEGIN, SET, DECLARE, FETCH, CLOSE, COMMIT */
function mockCursorQuery(fetchResult: { fields: Array<{ name: string }>; rows: Record<string, unknown>[] }) {
  mockQuery
    .mockResolvedValueOnce({}) // BEGIN TRANSACTION READ ONLY
    .mockResolvedValueOnce({}) // SET LOCAL search_path TO public
    .mockResolvedValueOnce({}) // DECLARE _foc_cursor ...
    .mockResolvedValueOnce(fetchResult) // FETCH ... FROM _foc_cursor
    .mockResolvedValueOnce({}) // CLOSE _foc_cursor
    .mockResolvedValueOnce({}) // COMMIT
}

describe("PonderClient.querySql", () => {
  let client: InstanceType<typeof PonderClient>

  beforeEach(() => {
    client = new PonderClient(getNetworkConfig("calibnet"))
    mockQuery.mockReset()
    mockRelease.mockReset()
  })

  test("uses cursor-based query pipeline", async () => {
    mockCursorQuery({ fields: [{ name: "x" }], rows: [{ x: 1 }] })

    await client.querySql("SELECT 1 as x")

    expect(mockQuery).toHaveBeenNthCalledWith(1, "BEGIN TRANSACTION READ ONLY")
    expect(mockQuery).toHaveBeenNthCalledWith(2, "SET LOCAL search_path TO public")
    expect(mockQuery).toHaveBeenNthCalledWith(3, expect.stringContaining("DECLARE _foc_cursor"))
    expect(mockQuery).toHaveBeenNthCalledWith(4, `FETCH ${MAX_ROWS + 1} FROM _foc_cursor`)
    expect(mockQuery).toHaveBeenNthCalledWith(5, "CLOSE _foc_cursor")
    expect(mockQuery).toHaveBeenNthCalledWith(6, "COMMIT")
    expect(mockRelease).toHaveBeenCalled()
  })

  test("converts bigint values to strings", async () => {
    mockCursorQuery({
      fields: [{ name: "amount" }],
      rows: [{ amount: 1000000000000000000n }],
    })

    const result = await client.querySql("SELECT 1e18 as amount")
    expect(result.rows[0].amount).toBe("1000000000000000000")
    expect(typeof result.rows[0].amount).toBe("string")
  })

  test("truncates results beyond MAX_ROWS", async () => {
    const bigResult = Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({ id: i }))
    mockCursorQuery({ fields: [{ name: "id" }], rows: bigResult })

    const result = await client.querySql("SELECT id FROM fp_deposit")
    expect(result.rowCount).toBe(MAX_ROWS)
    expect((result as Record<string, unknown>).truncated).toBe(true)
  })

  test("does not set truncated flag for small results", async () => {
    mockCursorQuery({ fields: [{ name: "id" }], rows: [{ id: 1 }] })

    const result = await client.querySql("SELECT 1 as id")
    expect(result.rowCount).toBe(1)
    expect((result as Record<string, unknown>).truncated).toBeUndefined()
  })

  test("rejects invalid SQL before querying", async () => {
    await expect(client.querySql("DROP TABLE foo")).rejects.toThrow(/Only SELECT/)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  test("rolls back on query error", async () => {
    mockQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET
      .mockRejectedValueOnce(new Error("syntax error")) // DECLARE fails
      .mockResolvedValueOnce({}) // ROLLBACK

    await expect(client.querySql("SELECT bad syntax")).rejects.toThrow("syntax error")
    expect(mockQuery).toHaveBeenLastCalledWith("ROLLBACK")
    expect(mockRelease).toHaveBeenCalled()
  })

  test("returns correct column names", async () => {
    mockCursorQuery({
      fields: [{ name: "rail_id" }, { name: "amount" }],
      rows: [{ rail_id: 1, amount: 100 }],
    })

    const result = await client.querySql("SELECT rail_id, amount FROM fp_rail_settled")
    expect(result.columns).toEqual(["rail_id", "amount"])
  })

  test("EXPLAIN uses direct execution, not cursor", async () => {
    mockQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET
      .mockResolvedValueOnce({ // EXPLAIN result (direct query, no cursor)
        fields: [{ name: "QUERY PLAN" }],
        rows: [{ "QUERY PLAN": "Seq Scan on fp_deposit (cost=0.00..1.00 rows=1 width=32)" }],
      })
      .mockResolvedValueOnce({}) // COMMIT

    const result = await client.querySql("EXPLAIN SELECT * FROM fp_deposit")

    expect(result.columns).toEqual(["QUERY PLAN"])
    expect(result.rows).toHaveLength(1)
    // Should NOT have DECLARE/FETCH/CLOSE calls
    expect(mockQuery).toHaveBeenCalledTimes(4)
    expect(mockQuery).toHaveBeenNthCalledWith(3, "EXPLAIN SELECT * FROM fp_deposit")
  })
})
