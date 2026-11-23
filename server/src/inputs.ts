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

// uint256 has at most 78 decimal digits
const SET_ID_RE = /^\d{1,78}$/

export const MAX_WEEKS = 520

/** EVM address, lowercased. */
export function parseAddress(value: string): string {
  if (!ADDRESS_RE.test(value)) {
    throw new InputError("Invalid address: expected 0x followed by 40 hex characters.")
  }
  return value.toLowerCase()
}

/** Dataset ID as a canonical decimal string, without leading zeros. */
export function parseSetId(value: string): string {
  if (!SET_ID_RE.test(value)) {
    throw new InputError("Invalid dataset ID: expected a non-negative integer.")
  }
  return BigInt(value).toString()
}

/** History window in weeks, 1 to MAX_WEEKS. */
export function parseWeeks(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_WEEKS) {
    throw new InputError(`Invalid weeks: expected an integer from 1 to ${MAX_WEEKS}.`)
  }
  return value
}
