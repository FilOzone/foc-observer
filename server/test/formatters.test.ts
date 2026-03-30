import { describe, expect, test } from "vitest"
import { formatTableList, formatStandardColumns, tableCount, TABLES } from "../src/table-metadata.js"

describe("camelToSnake via formatTableList", () => {
  const output = formatTableList()

  test("simple camelCase", () => {
    expect(output).toContain("data_set_id:bigint")
    expect(output).toContain("provider_id:bigint")
    expect(output).toContain("rail_id:bigint")
  })

  test("consecutive caps (withCDN)", () => {
    expect(output).toContain("with_cdn:bool")
    expect(output).not.toContain("with_c_d_n")
  })

  test("multi-word (cacheMissRailId)", () => {
    expect(output).toContain("cache_miss_rail_id:bigint")
  })

  test("includes types", () => {
    expect(output).toContain(":bigint")
    expect(output).toContain(":hex")
    expect(output).toContain(":text")
    expect(output).toContain(":bool")
    expect(output).toContain(":int")
  })

  test("includes notes", () => {
    expect(output).toContain(": USDFC/epoch, 18 dec")
    expect(output).toContain(": CID string")
    expect(output).toContain(": JSON")
  })

  test("includes descriptions", () => {
    expect(output).toContain("Settlement (amounts INCREMENTAL")
    expect(output).toContain("Proving fault")
  })
})

describe("formatStandardColumns", () => {
  test("includes standard fields", () => {
    const output = formatStandardColumns()
    expect(output).toContain("tx_hash:hex")
    expect(output).toContain("tx_from:hex")
    expect(output).toContain("gas_used:bigint")
    expect(output).toContain("block_number:bigint")
    expect(output).toContain("timestamp:bigint")
  })

  test("excludes id", () => {
    expect(formatStandardColumns()).not.toMatch(/^id:/)
  })
})

describe("tableCount", () => {
  test("matches TABLES keys", () => {
    expect(tableCount()).toBe(Object.keys(TABLES).length)
  })

  test("is at least 40", () => {
    expect(tableCount()).toBeGreaterThanOrEqual(40)
  })
})
