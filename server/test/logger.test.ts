import { afterEach, describe, expect, test, vi } from "vitest"
import { InputError } from "../src/inputs.js"
import { ServiceUnavailableError } from "../src/public-error.js"
import { logBackendError, logMcp, logSql } from "../src/logger.js"

const writes: string[] = []

function captureLogs() {
  return vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
}

afterEach(() => {
  writes.length = 0
  vi.restoreAllMocks()
})

describe("structured logging", () => {
  test("logs bounded nested database failure metadata without diagnostics or SQL", () => {
    captureLogs()
    const sql = "SELECT * FROM fp_deposit WHERE note = 'https://secret.invalid/token'"
    const error = new Error("postgres://user:password@database/private failure", {
      cause: { code: "42501", message: "permission denied for private_table" },
    })

    logSql("rest", "mainnet", sql, 12, { error: "backend" })
    logMcp("query_sql", 12)
    logBackendError("postgres", "query", error, "mainnet")

    const output = writes.join("")
    expect(output).not.toContain(sql)
    expect(output).not.toContain("secret.invalid")
    expect(output).not.toContain("password")
    expect(output).not.toContain("private_table")
    expect(output).toContain('"category":"database"')
    expect(output).toContain('"code":"42501"')
  })

  test("retains a capped SQL excerpt for successful queries", () => {
    captureLogs()
    const sql = `SELECT '${"x".repeat(2_100)}'`

    logSql("rest", "mainnet", sql, 12, { rowCount: 1 })

    const output = writes.join("")
    expect(output).toContain('"sql":"SELECT')
    expect(output).toContain("...")
    expect(output).not.toContain("x".repeat(2_001))
  })

  test("logs a bounded cause carried by a public availability error", () => {
    captureLogs()
    const error = new ServiceUnavailableError("Database unavailable.", {
      cause: { code: "ECONNRESET", message: "postgres://private-token" },
    })

    logBackendError("postgres", "checkout", error, "mainnet")

    const output = writes.join("")
    expect(output).toContain('"category":"network"')
    expect(output).toContain('"code":"ECONNRESET"')
    expect(output).not.toContain("private-token")
  })

  test("classifies upstream authorization failures without response details", () => {
    captureLogs()

    logBackendError("upstream", "response", { status: 403, message: "https://private.invalid/token" })

    const output = writes.join("")
    expect(output).toContain('"category":"upstream"')
    expect(output).toContain('"cause":"authentication"')
    expect(output).toContain('"code":403')
    expect(output).not.toContain("private.invalid")
  })

  test("does not log caller input errors as backend failures", () => {
    captureLogs()

    logBackendError("postgres", "query", new InputError("Invalid private input"), "mainnet")

    expect(writes).toEqual([])
  })
})
