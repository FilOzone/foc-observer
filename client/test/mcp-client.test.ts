/**
 * Offline tests for the MCP client helpers.
 * Tests response parsing, error handling, and URL resolution.
 * No live server needed, mocks the MCP Client.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { describe, expect, test, vi } from "vitest"
import { callTool } from "../src/mcp-client.js"

function callToolWithResult(result: Partial<CallToolResult>): Promise<unknown> {
  const client = new Client({ name: "test", version: "1.0.0" })
  vi.spyOn(client, "callTool").mockResolvedValue(result as CallToolResult)
  return callTool(client, "get_status")
}

describe("callTool response parsing", () => {
  test("extracts JSON from text content", async () => {
    const result = await callToolWithResult({
      content: [{ type: "text", text: '{"network":"mainnet","providers":[]}' }],
    })
    expect(result).toEqual({ network: "mainnet", providers: [] })
  })

  test("handles multiple content items, picks first text", async () => {
    const result = await callToolWithResult({
      content: [
        { type: "image", data: "", mimeType: "image/png" },
        { type: "text", text: '{"value":42}' },
        { type: "text", text: '{"value":99}' },
      ],
    })
    expect(result).toEqual({ value: 42 })
  })

  test("returns empty object for missing content", async () => {
    await expect(callToolWithResult({})).resolves.toEqual({})
    await expect(callToolWithResult({ content: [] })).resolves.toEqual({})
  })

  test("throws on error result with message", async () => {
    await expect(callToolWithResult({
      content: [{ type: "text", text: "Error: table not found" }],
      isError: true,
    })).rejects.toThrow("Error: table not found")
  })

  test("throws generic message on error without text", async () => {
    await expect(callToolWithResult({ isError: true })).rejects.toThrow("Unknown error")
    await expect(callToolWithResult({ content: [], isError: true })).rejects.toThrow("Unknown error")
  })

  test("handles nested JSON with bigint strings", async () => {
    const result = await callToolWithResult({
      content: [{ type: "text", text: '{"amount":"1000000000000000000","rate":"694444444444"}' }],
    })
    expect(result).toEqual({ amount: "1000000000000000000", rate: "694444444444" })
  })

  test("handles array results", async () => {
    const result = await callToolWithResult({
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
