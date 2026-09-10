import { describe, expect, test } from "vitest"
import { sqlNotices } from "../src/tripwires.js"

const AXLUSDC = "0xeb466342c4d449bc9f53a865d5cb90586f405215"
const USDFC = "0x80b98d3aa09ffff255c3ba4a241111ff1262f045"
const empty = { columns: [], rows: [], rowCount: 0 }

const has = (notices: string[], substr: string) => notices.some((n) => n.includes(substr))

describe("sqlNotices tripwires", () => {
  test("two-channel: fp_rail_settled SUM without fp_one_time_payment warns", () => {
    const n = sqlNotices("SELECT SUM(total_net_payee_amount) FROM fp_rail_settled", empty)
    expect(has(n, "fp_one_time_payment")).toBe(true)
  })

  test("two-channel: silent when both channels present", () => {
    const n = sqlNotices(
      "SELECT SUM(s.total_net_payee_amount) FROM fp_rail_settled s UNION ALL SELECT SUM(o.net_payee_amount) FROM fp_one_time_payment o",
      empty,
    )
    expect(has(n, "fp_one_time_payment is a parallel")).toBe(false)
  })

  test("per-token: a fixed /1e18 warns", () => {
    const n = sqlNotices("SELECT SUM(total_settled_amount)/1e18 FROM fp_rail_settled", empty)
    expect(has(n, "collapses axlUSDC")).toBe(true)
  })

  test("per-token: SUM(amount) without token grouping warns", () => {
    const n = sqlNotices("SELECT SUM(amount) FROM fp_deposit", empty)
    expect(has(n, "without GROUP BY token")).toBe(true)
  })

  test("per-token: SUM with token grouping does not warn about mixing", () => {
    const n = sqlNotices("SELECT token, SUM(amount) FROM fp_deposit GROUP BY token", empty)
    expect(has(n, "without GROUP BY token")).toBe(false)
  })

  test("result-shape: mixed-token result including axlUSDC warns", () => {
    const result = {
      columns: ["token", "n"],
      rows: [{ token: USDFC, n: "5" }, { token: AXLUSDC, n: "3" }],
      rowCount: 2,
    }
    const n = sqlNotices("SELECT token, COUNT(*) n FROM fp_rail_created GROUP BY token", result)
    expect(has(n, "spans multiple tokens")).toBe(true)
  })

  test("result-shape: single-token result does not warn", () => {
    const result = { columns: ["token", "n"], rows: [{ token: USDFC, n: "5" }], rowCount: 1 }
    const n = sqlNotices("SELECT token, COUNT(*) n FROM fp_rail_created GROUP BY token", result)
    expect(has(n, "spans multiple tokens")).toBe(false)
  })

  test("clean analytical query produces no notices", () => {
    const n = sqlNotices("SELECT provider_id, COUNT(*) FROM fwss_data_set_created GROUP BY provider_id", empty)
    expect(n).toHaveLength(0)
  })
})
