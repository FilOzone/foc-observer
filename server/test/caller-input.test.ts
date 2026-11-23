/**
 * Offline tests for caller input that reaches upstream queries. Proving SQL
 * passes the validator and carries input only as bound parameters; Goldsky and
 * DealBot reject malformed input before any request is made.
 */

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { DealbotClient } from "../src/dealbot-client.js"
import { InputError } from "../src/inputs.js"
import type { NetworkConfig, NetworkName } from "../src/networks.js"
import type { PonderClient, SqlResult } from "../src/ponder-client.js"
import { ProvingClient } from "../src/proving-client.js"
import { initParser, validateSql } from "../src/sql-validator.js"
import { SubgraphClient } from "../src/subgraph-client.js"

beforeAll(async () => {
  await initParser()
})

const ADDRESS = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01"
const SET_ID = "987654321"

// Covers every column the proving methods read.
const ROW = {
  address: ADDRESS.toLowerCase(),
  total_periods: 0,
  faulted_periods: 0,
  total_datasets: 1,
  active_datasets: 1,
  week: "2026-11-16T00:00:00.000Z",
  periods: 7,
  faults: 1,
  n: 3,
  set_id: SET_ID,
  proving_period: 2880,
  last_period_ts: "1763251200",
  last_proof_ts: "1763251200",
}

interface Call {
  sql: string
  params: ReadonlyArray<string | number>
}

/** Validates like PonderClient.queryInternal, records each call, returns one row. */
function provingClient(): { client: ProvingClient; calls: Call[] } {
  const calls: Call[] = []
  const ponder = {
    async queryInternal(sql: string, params: ReadonlyArray<string | number> = []): Promise<SqlResult> {
      validateSql(sql)
      calls.push({ sql, params })
      return { columns: Object.keys(ROW), rows: [{ ...ROW }], rowCount: 1 }
    },
  }
  return { client: new ProvingClient(ponder as unknown as PonderClient), calls }
}

const BAD_ADDRESSES = [
  "x' OR '1'='1",
  `${ADDRESS}' OR '1'='1`,
  `${ADDRESS}'; SELECT 1; --`,
  ` ${ADDRESS}`,
  `0x${"g".repeat(40)}`,
  ADDRESS.slice(0, -1),
  "",
]

const BAD_SET_IDS = [
  "1'",
  "1; SELECT 1",
  "1) SELECT 1 --",
  "(SELECT CAST(current_user AS int))",
  "-1",
  "1.5",
  " 1",
  "",
]

describe("ProvingClient", () => {
  test("getProviderHealth binds the lowercased address to every query", async () => {
    const { client, calls } = provingClient()
    const health = await client.getProviderHealth(ADDRESS, 4)

    expect(health?.provider.address).toBe(ADDRESS.toLowerCase())
    expect(calls).toHaveLength(8)
    for (const { sql, params } of calls) {
      expect(params[0]).toBe(ADDRESS.toLowerCase())
      expect(sql.toLowerCase()).not.toContain(ADDRESS.toLowerCase())
    }
  })

  test("getDataset binds the set ID to every query", async () => {
    const { client, calls } = provingClient()
    const dataset = await client.getDataset(SET_ID)

    expect(dataset?.setId).toBe(SET_ID)
    expect(calls).toHaveLength(2)
    for (const { sql, params } of calls) {
      expect(params).toEqual([SET_ID])
      expect(sql).not.toContain(SET_ID)
    }
  })

  test("getDataset canonicalises leading zeros", async () => {
    const { client, calls } = provingClient()
    await client.getDataset(`000${SET_ID}`)
    expect(calls.map((c) => c.params)).toEqual([[SET_ID], [SET_ID]])
  })

  test("getProviders queries pass the validator", async () => {
    const { client, calls } = provingClient()
    await client.getProviders()
    expect(calls).toHaveLength(2)
  })

  test.each(BAD_ADDRESSES)("getProviderHealth rejects address %j before querying", async (address) => {
    const { client, calls } = provingClient()
    await expect(client.getProviderHealth(address)).rejects.toThrow(InputError)
    expect(calls).toHaveLength(0)
  })

  test.each([0, -1, 1.5, Number.NaN, 521])("getProviderHealth rejects weeks %j before querying", async (weeks) => {
    const { client, calls } = provingClient()
    await expect(client.getProviderHealth(ADDRESS, weeks)).rejects.toThrow(InputError)
    expect(calls).toHaveLength(0)
  })

  test.each(BAD_SET_IDS)("getDataset rejects set ID %j before querying", async (setId) => {
    const { client, calls } = provingClient()
    await expect(client.getDataset(setId)).rejects.toThrow(InputError)
    expect(calls).toHaveLength(0)
  })
})

/** Stub fetch; `body` is returned as JSON. Calls are recorded on the spy. */
function stubFetch(body: unknown = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(body)))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("SubgraphClient", () => {
  const configs = new Map<NetworkName, NetworkConfig>([
    ["mainnet", { subgraphUrl: "https://subgraph.invalid/mainnet" } as NetworkConfig],
  ])

  test("puts the lowercased address into the query", async () => {
    const fetchSpy = stubFetch({ data: { provider: null } })
    await new SubgraphClient(configs).getProvider("mainnet", ADDRESS)
    const { query } = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as { query: string }
    expect(query).toContain(`provider(id: "${ADDRESS.toLowerCase()}")`)
  })

  test("puts a canonical set ID into the query", async () => {
    const fetchSpy = stubFetch({ data: { dataSets: [] } })
    await new SubgraphClient(configs).getDataset("mainnet", "007")
    const { query } = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as { query: string }
    expect(query).toContain("setId: 7 }")
  })

  describe.each(BAD_ADDRESSES)("address %j", (address) => {
    test.each([
      ["getProvider", (s: SubgraphClient) => s.getProvider("mainnet", address)],
      ["getProviderWeekly", (s: SubgraphClient) => s.getProviderWeekly("mainnet", address)],
      ["getProviderDatasets", (s: SubgraphClient) => s.getProviderDatasets("mainnet", address)],
      ["getProviderProvingHealth", (s: SubgraphClient) => s.getProviderProvingHealth("mainnet", address)],
    ])("%s rejects it before fetching", async (_name, call) => {
      const fetchSpy = stubFetch()
      await expect(call(new SubgraphClient(configs))).rejects.toThrow(InputError)
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  test.each(BAD_SET_IDS)("getDataset rejects set ID %j before fetching", async (setId) => {
    const fetchSpy = stubFetch()
    await expect(new SubgraphClient(configs).getDataset("mainnet", setId)).rejects.toThrow(InputError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test.each([0, 1.5, Number.NaN, 521])("rejects weeks %j before fetching", async (weeks) => {
    const fetchSpy = stubFetch()
    const subgraph = new SubgraphClient(configs)
    await expect(subgraph.getProviderWeekly("mainnet", ADDRESS, weeks)).rejects.toThrow(InputError)
    await expect(subgraph.getProviderProvingHealth("mainnet", ADDRESS, weeks)).rejects.toThrow(InputError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("DealbotClient.getProviderWindow", () => {
  test("requests the provider window", async () => {
    const fetchSpy = stubFetch()
    await new DealbotClient().getProviderWindow("mainnet", ADDRESS, "30d")
    expect(fetchSpy).toHaveBeenCalledWith(`https://dealbot.filoz.org/api/v1/providers/metrics/${ADDRESS}/window?preset=30d`)
  })

  test.each(["../../../anything?x=", "..", "a/b", "1%2F2", "x' OR '1'='1", ` ${ADDRESS}`, ""])(
    "rejects provider %j before fetching",
    async (provider) => {
      const fetchSpy = stubFetch()
      await expect(new DealbotClient().getProviderWindow("mainnet", provider)).rejects.toThrow(InputError)
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )

  test.each(["7d&y=1", "2d", ""])("rejects preset %j before fetching", async (preset) => {
    const fetchSpy = stubFetch()
    await expect(new DealbotClient().getProviderWindow("mainnet", ADDRESS, preset)).rejects.toThrow(InputError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
