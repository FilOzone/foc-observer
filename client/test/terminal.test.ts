import { describe, expect, test } from "vitest"
import { escapeTerminalText, formatTerminalValue, stringifyTerminalSafeJson } from "../src/terminal.js"

describe("terminal formatting", () => {
  test("renders terminal and display controls visibly", () => {
    expect(escapeTerminalText("name\n\u001b]8;;https://example.test\u0007link\u001b]8;;\u0007\u202e")).toBe(
      "name\\x0a\\x1b]8;;https://example.test\\x07link\\x1b]8;;\\x07\\u202e",
    )
  })

  test("keeps JSON parseable while escaping terminal controls", () => {
    const value = { rowCount: "12\u0085\u202e" }
    const output = stringifyTerminalSafeJson(value)

    expect(output).toBe('{"rowCount":"12\\u0085\\u202e"}')
    expect(JSON.parse(output)).toEqual(value)
  })

  test("formats null as a display value", () => {
    expect(formatTerminalValue(null)).toBe("NULL")
  })
})
