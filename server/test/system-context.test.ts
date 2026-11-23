import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterAll, beforeAll, expect, test, vi } from "vitest"
import { createMcpServer } from "../src/mcp-handler.js"
import { resolveSystemContext } from "../../shared/system-context.js"

const client = new Client({ name: "context-size-check", version: "1" })

beforeAll(async () => {
  vi.stubEnv("FOC_API_URL", "https://observer.example.org")
  const server = createMcpServer(new Map(), new Map())
  const [local, remote] = InMemoryTransport.createLinkedPair()
  await server.connect(remote)
  await client.connect(local)
})

afterAll(async () => {
  await client.close()
  vi.unstubAllEnvs()
})

// Count UTF-8 bytes after escaping the result, including its JSON-RPC envelope.
function wireBytes(result: unknown): number {
  return Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", id: 1, result }))
}

test("returns the complete guide in one empty-input call", async () => {
  const result = await client.callTool({ name: "get_system_context", arguments: {} })
  expect(result.isError).not.toBe(true)
  expect(wireBytes(result)).toBeLessThanOrEqual(64 * 1024)
  const expected = resolveSystemContext()
  expect(client.getInstructions()).toBe(expected.instructions)
  expect(Buffer.byteLength(expected.instructions)).toBeLessThanOrEqual(5 * 1024)

  const content = result.content[0]
  expect(content.type).toBe("text")
  if (content.type !== "text") throw new Error("Expected text content")
  const context = JSON.parse(content.text) as string
  expect(context).toBe(expected.systemContext)
  for (const table of ["fp_rail_settled", "fp_one_time_payment", "fwss_data_set_storage_terms_selected"]) {
    expect(context).toContain(table)
  }
})

test("discovery fits in 24 KiB before a client selects any tools", async () => {
  expect(wireBytes(await client.listTools())).toBeLessThanOrEqual(24 * 1024)
})
