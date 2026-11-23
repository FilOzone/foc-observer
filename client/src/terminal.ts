const TERMINAL_CONTROLS = /[\u0000-\u001f\u007f-\u009f\p{Cf}]/gu

/** Render untrusted text on one terminal line without executing control sequences. */
export function escapeTerminalText(value: string): string {
  return value.replace(TERMINAL_CONTROLS, (character) => {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined) return character
    return codePoint <= 0xff
      ? `\\x${codePoint.toString(16).padStart(2, "0")}`
      : `\\u${codePoint.toString(16).padStart(4, "0")}`
  })
}

/** Serialize JSON without leaving terminal controls in the output stream. */
export function stringifyTerminalSafeJson(value: unknown): string {
  return (JSON.stringify(value) ?? "null").replace(TERMINAL_CONTROLS, (character) => {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined) return character
    if (codePoint <= 0xffff) return `\\u${codePoint.toString(16).padStart(4, "0")}`
    const offset = codePoint - 0x10000
    const high = 0xd800 + (offset >> 10)
    const low = 0xdc00 + (offset & 0x3ff)
    return `\\u${high.toString(16)}\\u${low.toString(16)}`
  })
}

export function formatTerminalValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "bigint") return value.toString()
  return escapeTerminalText(String(value))
}
