/**
 * Result-side tripwires for query_sql.
 *
 * Cheap heuristics over the SQL text + results that warn about observed
 * recurring correctness traps.
 */
import type { SqlResult } from "./ponder-client.js"

const AXLUSDC = "0xeb466342c4d449bc9f53a865d5cb90586f405215"

export function sqlNotices(sql: string, result: SqlResult): string[] {
  const notices: string[] = []
  const q = sql.toLowerCase()

  // -- Two payment channels: fp_rail_settled is streaming only --
  const settled = q.includes("fp_rail_settled")
  const oneTime = q.includes("fp_one_time_payment")
  const aggregating = /\bsum\s*\(/.test(q) || /\brevenue\b/.test(q) || /\bvolume\b/.test(q)
  if (settled && !oneTime && aggregating) {
    notices.push(
      "fp_rail_settled is only the STREAMING channel. fp_one_time_payment is a parallel channel (often larger) with no gross column (gross = net_payee_amount + network_fee + operator_commission). Total volume = both; do not total from fp_rail_settled alone.",
    )
  }

  // -- Per-token decimals: a fixed /1e18 zeroes 6-decimal axlUSDC --
  const dividesBy1e18 = /\/\s*1e18\b/.test(q) || /\/\s*1_?0{18}\b/.test(q)
  const sumsAmount =
    /\bsum\s*\(/.test(q) && /(amount|net_payee|network_fee|operator_commission|value|price)/.test(q)
  const mentionsToken = /\btoken\b/.test(q)
  if (dividesBy1e18) {
    notices.push(
      "Decimals are per-token: axlUSDC = 6 (1e6), USDFC/FIL = 18 (1e18). A fixed /1e18 collapses axlUSDC value to ~0. JOIN fp_rail_created.token and scale each token by its own decimals.",
    )
  } else if (sumsAmount && !mentionsToken) {
    notices.push(
      "Summing amounts without GROUP BY token mixes 6-decimal (axlUSDC) and 18-decimal (USDFC/FIL) values. Scale per token before summing.",
    )
  }

  // -- Result-shape: a result set spanning multiple tokens including axlUSDC --
  const tokenCol = result.columns.find((c) => c.toLowerCase() === "token")
  if (tokenCol && result.rows.length > 1) {
    const tokens = new Set(result.rows.map((r) => String(r[tokenCol]).toLowerCase()))
    if (tokens.size > 1 && tokens.has(AXLUSDC)) {
      notices.push(
        "This result spans multiple tokens including axlUSDC (6-decimal). Scale each row by its own token's decimals; do not divide the whole set by one scalar.",
      )
    }
  }

  return notices
}
