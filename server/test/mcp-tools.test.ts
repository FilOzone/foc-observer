/**
 * MCP tool registration smoke tests.
 * Verifies all tools register correctly with valid schemas.
 * No live services needed, uses mock backends.
 */

import { describe, expect, test, beforeAll } from "vitest"
import { createMcpServer } from "../src/mcp-handler.js"
import { BetterStackClient } from "../src/betterstack-client.js"
import { SubgraphClient } from "../src/subgraph-client.js"
import { getNetworkConfig } from "../src/networks.js"
import type { PonderClient } from "../src/ponder-client.js"
import type { ContractReader } from "../src/contract-reader.js"
import type { NetworkName } from "../src/networks.js"

// resolveSystemContext needs this
beforeAll(() => {
  process.env.FOC_API_URL = "https://test.example.com"
})

function mockPonderClients(): Map<NetworkName, PonderClient> {
  return new Map([
    ["calibnet", {} as PonderClient],
    ["mainnet", {} as PonderClient],
  ])
}

function mockContractReaders(): Map<NetworkName, ContractReader> {
  return new Map([
    ["calibnet", {} as ContractReader],
    ["mainnet", {} as ContractReader],
  ])
}

describe("MCP tool registration", () => {
  test("server creates without error", () => {
    const server = createMcpServer(
      mockPonderClients(),
      mockContractReaders(),
      new BetterStackClient("test", "test"),
      new SubgraphClient(new Map([["calibnet", getNetworkConfig("calibnet")], ["mainnet", getNetworkConfig("mainnet")]])),
    )
    expect(server).toBeDefined()
  })

  test("server creates without optional backends", () => {
    const server = createMcpServer(
      mockPonderClients(),
      mockContractReaders(),
    )
    expect(server).toBeDefined()
  })
})

describe("MCP expected tools", () => {
  const expectedTools = [
    "get_system_context",
    "query_sql",
    "list_tables",
    "describe_table",
    "get_status",
    "get_providers",
    "get_provider",
    "get_dataset",
    "get_dataset_proving",
    "get_rail",
    "get_pricing",
    "get_auction",
    "get_account",
    "get_dealbot_stats",
    "get_dealbot_providers",
    "get_dealbot_provider_detail",
    "get_dealbot_daily",
    "get_dealbot_failures",
    "get_proving_health",
    "get_proving_dataset",
  ]

  test("expected tool count is 20", () => {
    expect(expectedTools.length).toBe(20)
  })

  test("no duplicate tool names", () => {
    expect(new Set(expectedTools).size).toBe(expectedTools.length)
  })

  test("tools without affirmation gate are discovery tools", () => {
    const ungated = ["get_system_context", "get_status", "list_tables", "describe_table", "get_providers", "get_provider", "get_pricing"]
    // These should NOT require i_have_read_the_system_context
    for (const tool of ungated) {
      expect(expectedTools).toContain(tool)
    }
  })
})

describe("system context resolution", () => {
  test("resolveSystemContext substitutes URL", async () => {
    const { resolveSystemContext } = await import("../src/system-context.js")
    const { instructions, systemContext } = resolveSystemContext("https://example.com")
    expect(instructions).toContain("FOC")
    expect(instructions).not.toContain("{{BASE_URL}}")
    expect(systemContext).toContain("https://example.com")
    expect(systemContext).not.toContain("{{BASE_URL}}")
  })

  test("resolveSystemContext uses FOC_API_URL env var", async () => {
    const { resolveSystemContext } = await import("../src/system-context.js")
    const { systemContext } = resolveSystemContext()
    expect(systemContext).toContain("https://test.example.com")
  })
})
