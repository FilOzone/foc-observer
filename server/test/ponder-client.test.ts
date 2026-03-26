/**
 * Offline unit tests for PonderClient query pipeline.
 * Uses a mocked pg.Pool, no Postgres needed.
 */

import { describe, expect, test, vi, beforeEach } from "vitest"
import { getNetworkConfig } from "../src/networks.js"

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

describe("PonderClient.querySql", () => {
  let client: InstanceType<typeof PonderClient>

  beforeEach(() => {
    client = new PonderClient(getNetworkConfig("calibnet"))
    mockQuery.mockReset()
    mockRelease.mockReset()
  })

  test("wraps query in READ ONLY transaction", async () => {
    mockQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET search_path
      .mockResolvedValueOnce({ fields: [{ name: "x" }], rows: [{ x: 1 }] })
      .mockResolvedValueOnce({}) // COMMIT

    await client.querySql("SELECT 1 as x")

    expect(mockQuery).toHaveBeenNthCalledWith(1, "BEGIN TRANSACTION READ ONLY")
    expect(mockQuery).toHaveBeenNthCalledWith(2, "SET LOCAL search_path TO public")
    expect(mockQuery).toHaveBeenNthCalledWith(3, "SELECT 1 as x")
    expect(mockQuery).toHaveBeenNthCalledWith(4, "COMMIT")
    expect(mockRelease).toHaveBeenCalled()
  })

  test("converts bigint values to strings", async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        fields: [{ name: "amount" }],
        rows: [{ amount: 1000000000000000000n }],
      })
      .mockResolvedValueOnce({})

    const result = await client.querySql("SELECT 1e18 as amount")
    expect(result.rows[0].amount).toBe("1000000000000000000")
    expect(typeof result.rows[0].amount).toBe("string")
  })

  test("truncates results beyond MAX_ROWS", async () => {
    const bigResult = Array.from({ length: 10005 }, (_, i) => ({ id: i }))
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ fields: [{ name: "id" }], rows: bigResult })
      .mockResolvedValueOnce({})

    const result = await client.querySql("SELECT id FROM big_table")
    expect(result.rowCount).toBe(10000)
    expect((result as Record<string, unknown>).truncated).toBe(true)
    expect((result as Record<string, unknown>).totalRows).toBe(10005)
  })

  test("does not set truncated flag for small results", async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ fields: [{ name: "id" }], rows: [{ id: 1 }] })
      .mockResolvedValueOnce({})

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
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("syntax error"))
      .mockResolvedValueOnce({}) // ROLLBACK

    await expect(client.querySql("SELECT bad syntax")).rejects.toThrow("syntax error")
    expect(mockQuery).toHaveBeenLastCalledWith("ROLLBACK")
    expect(mockRelease).toHaveBeenCalled()
  })

  test("returns correct column names", async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        fields: [{ name: "rail_id" }, { name: "amount" }],
        rows: [{ rail_id: 1, amount: 100 }],
      })
      .mockResolvedValueOnce({})

    const result = await client.querySql("SELECT rail_id, amount FROM fp_rail_settled")
    expect(result.columns).toEqual(["rail_id", "amount"])
  })
})
