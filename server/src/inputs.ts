/**
 * Parsers for caller-supplied identifiers. Each returns a canonical value or
 * throws InputError, so query builders only ever receive values of a known
 * shape. Values still travel to Postgres as bound parameters; these checks
 * reject malformed input early and keep it out of GraphQL query text.
 */

export class InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InputError"
  }
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

const UINT256_RE = /^\d{1,78}$/
const MAX_UINT256 = (1n << 256n) - 1n

// Allows up to 50,000 SQL characters even with JSON unicode escapes.
export const MAX_REQUEST_BYTES = 320 * 1024

export const MAX_WEEKS = 520

/** EVM address, lowercased. */
export function parseAddress(value: string): string {
  if (!ADDRESS_RE.test(value)) {
    throw new InputError("Invalid address: expected 0x followed by 40 hex characters.")
  }
  return value.toLowerCase()
}

/** Canonical decimal contract identifier. Bound the input before BigInt conversion. */
export function parseUint256(value: string): string {
  if (UINT256_RE.test(value)) {
    const id = BigInt(value)
    if (id <= MAX_UINT256) return id.toString()
  }
  throw new InputError("Invalid ID: expected a decimal uint256.")
}

/** History window in weeks, 1 to MAX_WEEKS. */
export function parseWeeks(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_WEEKS) {
    throw new InputError(`Invalid weeks: expected an integer from 1 to ${MAX_WEEKS}.`)
  }
  return value
}
