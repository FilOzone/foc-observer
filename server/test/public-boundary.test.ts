import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { describe, expect, test, vi } from "vitest"
import type { ContractReader } from "../src/contract-reader.js"
import { DealbotClient } from "../src/dealbot-client.js"
import { createMcpServer } from "../src/mcp-handler.js"
import type { NetworkName } from "../src/networks.js"
import type { PonderClient } from "../src/ponder-client.js"
import { createRoutes } from "../src/routes.js"
import type { SubgraphClient } from "../src/subgraph-client.js"

function fixture() {
  const querySql = vi.fn(async () => ({ columns: ["n"], rows: [{ n: 1 }], rowCount: 1 }))
  const getProvider = vi.fn(async (_id: bigint) => { throw new Error("upstream path contained a private token") })
  const ponderClients = new Map<NetworkName, PonderClient>([["mainnet", { querySql } as unknown as PonderClient]])
  const contractReaders = new Map<NetworkName, ContractReader>([["mainnet", { getProvider } as unknown as ContractReader]])
  const app = createRoutes({ ponderClients, contractReaders, subgraph: {} as SubgraphClient, dealbot: new DealbotClient() })
  return { app, querySql, getProvider, ponderClients, contractReaders }
}

describe("public request boundaries", () => {
  test("rejects large SQL bodies before parsing, with or without Content-Length", async () => {
    const { app, querySql } = fixture()
    const body = JSON.stringify({ sql: " ".repeat(330_000), network: "mainnet" })
    for (const headers of [new Headers(), new Headers({ "content-length": String(body.length) })]) {
      const response = await app.request("/sql", { method: "POST", headers, body })
      expect(response.status).toBe(413)
    }
    expect(querySql).not.toHaveBeenCalled()
  })

  test("rejects malformed JSON and accepts a valid small query", async () => {
    const { app, querySql } = fixture()
    for (const body of ["{", "null", "[]"]) {
      expect((await app.request("/sql", { method: "POST", body })).status).toBe(400)
    }
    const res = await app.request("/sql", { method: "POST", body: JSON.stringify({ network: "mainnet", sql: "SELECT 1 AS n" }) })
    expect((await res.json()).rows).toEqual([{ n: 1 }])
    expect(querySql).toHaveBeenCalledTimes(1)
  })

  test("rejects oversized uint256 IDs locally and keeps RPC diagnostics off both transports", async () => {
    const { app, getProvider, ponderClients, contractReaders } = fixture()
    const max = (1n << 256n) - 1n
    expect((await app.request(`/provider/mainnet/${max + 1n}`)).status).toBe(400)
    expect(getProvider).not.toHaveBeenCalled()
    const res = await app.request(`/provider/mainnet/${max}`)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: "Backend request failed." })
    expect(getProvider).toHaveBeenCalledWith(max)
    vi.stubEnv("FOC_API_URL", "https://example.invalid")
    const client = new Client({ name: "boundary-test", version: "1" })
    const server = createMcpServer(ponderClients, contractReaders)
    const [local, remote] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(remote)
      await client.connect(local)
      const result = await client.callTool({ name: "get_provider", arguments: { network: "mainnet", providerId: "1" } })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual([{ type: "text", text: "Error: Backend request failed." }])
    } finally {
      await client.close()
      await server.close()
      vi.unstubAllEnvs()
    }
  })

  test("redacts database permission failures", async () => {
    const { app, querySql } = fixture()
    querySql.mockRejectedValueOnce({
      code: "42501",
      message: "permission denied for public.private_table with token secret",
    })

    const response = await app.request("/sql", {
      method: "POST",
      body: JSON.stringify({ network: "mainnet", sql: "SELECT * FROM fp_deposit" }),
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ network: "mainnet", error: "Backend request failed." })
  })
})
