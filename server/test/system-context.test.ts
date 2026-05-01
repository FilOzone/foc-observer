import { describe, expect, test } from "vitest"
import { INSTRUCTIONS, SYSTEM_CONTEXT } from "../src/system-context.js"

/**
 * Claude Code (and similar MCP clients) cap individual tool result sizes.
 * Default cap is 25,000 tokens; Claude Code's internal char-to-token estimate
 * is ~3 chars/token, giving a hard ceiling of ~75,000 chars. Our
 * get_system_context tool returns SYSTEM_CONTEXT verbatim plus JSON envelope
 * overhead (~3KB), so we keep the body well under the ceiling.
 *
 * If this test fails, trim SYSTEM_CONTEXT before merging. Don't bump the
 * threshold without checking that real Claude Code clients still accept the
 * payload.
 *
 * Reference: https://github.com/anthropics/claude-code/issues/4002
 */
const TOKEN_LIMIT = 25_000
const CHARS_PER_TOKEN = 3
const SAFETY_MARGIN = 0.85 // leave 15% headroom for JSON envelope + future content
const SYSTEM_CONTEXT_MAX_CHARS = Math.floor(TOKEN_LIMIT * CHARS_PER_TOKEN * SAFETY_MARGIN)

// INSTRUCTIONS is loaded by every MCP client at session start, so it counts
// toward both the system-prompt budget and the user-visible context. Keep it
// modest. No published Claude Code limit, so this is a sensibility check.
const INSTRUCTIONS_MAX_CHARS = 15_000

describe("system-context size budget", () => {
  test(`SYSTEM_CONTEXT is under ${SYSTEM_CONTEXT_MAX_CHARS} chars (~${TOKEN_LIMIT} token MCP cap with ${Math.round((1 - SAFETY_MARGIN) * 100)}% headroom)`, () => {
    const len = SYSTEM_CONTEXT.length
    const estimatedTokens = Math.ceil(len / CHARS_PER_TOKEN)
    expect(
      len,
      `SYSTEM_CONTEXT is ${len} chars (~${estimatedTokens} tokens). Trim before merging; Claude Code rejects MCP tool results above ${TOKEN_LIMIT} tokens.`,
    ).toBeLessThanOrEqual(SYSTEM_CONTEXT_MAX_CHARS)
  })

  test(`INSTRUCTIONS is under ${INSTRUCTIONS_MAX_CHARS} chars`, () => {
    const len = INSTRUCTIONS.length
    expect(
      len,
      `INSTRUCTIONS is ${len} chars. Loaded into every MCP session; keep it lean.`,
    ).toBeLessThanOrEqual(INSTRUCTIONS_MAX_CHARS)
  })
})
