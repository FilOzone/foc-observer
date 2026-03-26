/**
 * Live integration tests against Ponder Postgres on calibnet.
 * Requires Ponder running with Postgres on localhost:5433.
 * Run with: npm run test:live
 */

import { describe, expect, test, afterAll } from "vitest"
import { PonderClient } from "../src/ponder-client.js"
import { getNetworkConfig } from "../src/networks.js"

const LIVE = process.env.LIVE_TEST === "1"

describe.skipIf(!LIVE)("PonderClient against calibnet", () => {
  const client = new PonderClient(getNetworkConfig("calibnet"))

  afterAll(async () => {
    await client.close()
  })

  test("querySql returns results", async () => {
    const result = await client.querySql("SELECT COUNT(*) as count FROM fp_rail_settled")
    expect(result.columns).toContain("count")
    expect(result.rowCount).toBe(1)
    expect(Number(result.rows[0].count)).toBeGreaterThan(0)
  })

  test("listTables returns FOC tables", async () => {
    const tables = await client.listTables()
    expect(tables.length).toBeGreaterThan(20)
    const names = tables.map((t) => t.name)
    expect(names).toContain("fp_rail_settled")
    expect(names).toContain("fwss_fault_record")
    expect(names).toContain("pdp_possession_proven")
    // No internal tables
    expect(names.filter((n) => n.startsWith("_reorg__"))).toHaveLength(0)
    expect(names.filter((n) => n.startsWith("_ponder"))).toHaveLength(0)
  })

  test("describeTable returns columns", async () => {
    const columns = await client.describeTable("fp_rail_settled")
    expect(columns.length).toBeGreaterThan(0)
    const names = columns.map((c) => c.name)
    expect(names).toContain("rail_id")
    expect(names).toContain("total_settled_amount")
    expect(names).toContain("block_number")
    expect(names).toContain("timestamp")
  })

  test("describeTable returns empty for nonexistent table", async () => {
    const columns = await client.describeTable("nonexistent_table_xyz")
    expect(columns).toHaveLength(0)
  })

  test("getStatus reports healthy", async () => {
    const status = await client.getStatus()
    expect(status.reachable).toBe(true)
    expect(status.tables).toBeGreaterThan(20)
    expect(status.totalRows).toBeGreaterThan(0)
    expect(status.network).toBe("calibnet")
  })

})
