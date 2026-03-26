/**
 * Offline tests for the MCP client helpers.
 * Tests response parsing, error handling, and URL resolution.
 * No live server needed, mocks the MCP Client.
 */

import { describe, expect, test, vi } from "vitest"

// We can't easily mock the SDK's Client class for callTool, but we can
// test the response parsing logic by extracting it. Since callTool is
// small, we replicate its logic here for direct testing.

function parseToolResult(result: { content?: unknown; isError?: boolean }): unknown {
  const content = result.content as Array<{ type: string; text?: string }> | undefined
  const firstText = content?.find((c) => c.type === "text")?.text
  if (result.isError) {
    throw new Error(firstText ?? "Unknown error")
  }
  return JSON.parse(firstText ?? "{}")
}

describe("callTool response parsing", () => {
  test("extracts JSON from text content", () => {
    const result = parseToolResult({
      content: [{ type: "text", text: '{"network":"mainnet","providers":[]}' }],
    })
    expect(result).toEqual({ network: "mainnet", providers: [] })
  })

  test("handles multiple content items, picks first text", () => {
    const result = parseToolResult({
      content: [
        { type: "image", text: "not this" },
        { type: "text", text: '{"value":42}' },
        { type: "text", text: '{"value":99}' },
      ],
    })
    expect(result).toEqual({ value: 42 })
  })

  test("returns empty object for missing content", () => {
    expect(parseToolResult({})).toEqual({})
    expect(parseToolResult({ content: [] })).toEqual({})
  })

  test("throws on error result with message", () => {
    expect(() => parseToolResult({
      content: [{ type: "text", text: "Error: table not found" }],
      isError: true,
    })).toThrow("Error: table not found")
  })

  test("throws generic message on error without text", () => {
    expect(() => parseToolResult({ isError: true })).toThrow("Unknown error")
    expect(() => parseToolResult({ content: [], isError: true })).toThrow("Unknown error")
  })

  test("handles nested JSON with bigint strings", () => {
    const result = parseToolResult({
      content: [{ type: "text", text: '{"amount":"1000000000000000000","rate":"694444444444"}' }],
    })
    expect(result).toEqual({ amount: "1000000000000000000", rate: "694444444444" })
  })

  test("handles array results", () => {
    const result = parseToolResult({
      content: [{ type: "text", text: '[{"name":"calibnet"},{"name":"mainnet"}]' }],
    })
    expect(result).toEqual([{ name: "calibnet" }, { name: "mainnet" }])
  })
})

describe("FOC_API_URL resolution", () => {
  test("requires FOC_API_URL for createMcpClient", async () => {
    const orig = process.env.FOC_API_URL
    delete process.env.FOC_API_URL
    const { createMcpClient } = await import("../src/mcp-client.js")
    await expect(createMcpClient()).rejects.toThrow("FOC_API_URL")
    if (orig) process.env.FOC_API_URL = orig
  })
})
