import { randomUUID } from "node:crypto"
import pg from "pg"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { getNetworkConfig, type NetworkName } from "../src/networks.js"
import { MAX_PG_ROW_BYTES, PonderClient, type SqlSizeMetrics } from "../src/ponder-client.js"
import { ProvingClient } from "../src/proving-client.js"
import { initParser } from "../src/sql-validator.js"

const DATABASE_URL = process.env.PROVING_QUERY_DATABASE_URL
const PROVIDER_A = "0x00000000000000000000000000000000000000a1"
const PROVIDER_B = "0x00000000000000000000000000000000000000b2"

let admin: pg.Client
let fixture: pg.Client
let fixtureDatabase: string | undefined
let fixtureCreated = false
let fixtureUrl: string

function fixtureDatabaseUrl(database: string): string {
  if (!DATABASE_URL) throw new Error("PROVING_QUERY_DATABASE_URL is not set")
  const url = new URL(DATABASE_URL)
  url.pathname = `/${database}`
  return url.toString()
}

async function seed(): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const created = [
    ["0xcreated-1", 1, PROVIDER_A, now - 1_000],
    ["0xcreated-2", 2, PROVIDER_A, now - 1_000],
    ["0xcreated-3", 3, PROVIDER_A, now - 1_000],
    ["0xcreated-4", 4, PROVIDER_A, now - 1_000],
    ["0xcreated-5", 5, PROVIDER_A, now - 1_000],
    ["0xcreated-6", 6, PROVIDER_B, now - 1_000],
  ]
  for (const values of created) {
    await fixture.query(
      "INSERT INTO pdp_data_set_created (id, set_id, storage_provider, timestamp) VALUES ($1, $2, $3, $4)",
      values,
    )
  }

  const periods = [
    ["0xperiod-2", 1, 0, 100, now - 60],
    ["0xperiod-10", 1, 10, 100, now - 60],
    ["0xperiod-1", 2, 0, 200, now - 120],
    ["0xperiod-1", 2, 10, 201, now - 60],
    ["0xperiod-1", 3, 10, 300, now - 60],
    ["0xperiod-1", 4, 10, 400, now - 22_000],
    ["0xperiod-1", 5, 10, 500, now - 120],
    ["0xperiod-2", 5, 0, 501, now - 60],
    ["0xperiod-1", 6, 10, 600, now - 60],
  ]
  for (const values of periods) {
    await fixture.query(
      "INSERT INTO pdp_next_proving_period (id, set_id, leaf_count, block_number, timestamp) VALUES ($1, $2, $3, $4, $5)",
      values,
    )
  }
  await fixture.query("INSERT INTO pdp_data_set_deleted (id, set_id) VALUES ($1, $2)", ["0xdeleted-1", 3])
}

function provingClient(network: NetworkName): { client: ProvingClient; close: () => Promise<void> } {
  const ponder = new PonderClient(getNetworkConfig(network, { queryDatabaseUrl: fixtureUrl }))
  return { client: new ProvingClient(ponder), close: () => ponder.close() }
}

async function activeFromProviders(network: NetworkName): Promise<Map<string, number>> {
  const { client, close } = provingClient(network)
  try {
    return new Map((await client.getProviders()).map(provider => [provider.address, provider.activeDataSets]))
  } finally {
    await close()
  }
}

async function activeFromProvider(network: NetworkName, address: string): Promise<number> {
  const { client, close } = provingClient(network)
  try {
    return (await client.getProviderHealth(address))?.provider.activeDataSets ?? -1
  } finally {
    await close()
  }
}

describe.skipIf(!DATABASE_URL)("ProvingClient active datasets against Postgres", () => {
  beforeAll(async () => {
    await initParser()
    admin = new pg.Client({ connectionString: DATABASE_URL })
    await admin.connect()
    fixtureDatabase = `zz_proving_client_${randomUUID().replaceAll("-", "")}`
    await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(fixtureDatabase)}`)
    fixtureCreated = true
    fixtureUrl = fixtureDatabaseUrl(fixtureDatabase)
    fixture = new pg.Client({ connectionString: fixtureUrl })
    await fixture.connect()
    await fixture.query(`
      CREATE TABLE pdp_data_set_created (id text, set_id bigint, storage_provider text, timestamp bigint);
      CREATE TABLE pdp_next_proving_period (
        id text, set_id bigint, leaf_count bigint, block_number bigint, timestamp bigint
      );
      CREATE TABLE pdp_possession_proven (id text, set_id bigint, timestamp bigint);
      CREATE TABLE pdp_data_set_deleted (id text, set_id bigint);
      CREATE TABLE pdp_pieces_added (id text, set_id bigint, timestamp bigint);
      CREATE TABLE fwss_data_set_created (source text);
    `)
    await seed()
  })

  afterAll(async () => {
    await fixture?.end()
    if (fixtureCreated && fixtureDatabase) await admin?.query(`DROP DATABASE ${pg.escapeIdentifier(fixtureDatabase)}`)
    await admin?.end()
  })

  test("uses latest recent state for provider and network queries", async () => {
    const active = await activeFromProviders("mainnet")
    expect(active.get(PROVIDER_A)).toBe(3)
    expect(active.get(PROVIDER_B)).toBe(1)
  })

  test("excludes data outside Calibration's three proving periods", async () => {
    const active = await activeFromProviders("calibnet")
    expect(active.get(PROVIDER_A)).toBe(2)
    expect(active.get(PROVIDER_B)).toBe(1)
  })

  test.each([
    ["mainnet", PROVIDER_A, 3],
    ["mainnet", PROVIDER_B, 1],
    ["calibnet", PROVIDER_A, 2],
    ["calibnet", PROVIDER_B, 1],
  ] as const)("matches provider health for %s %s", async (network, provider, expected) => {
    expect(await activeFromProvider(network, provider)).toBe(expected)
  })

  test("rejects excess database work before checkout, then admits requests after the queue drains", async () => {
    const ponder = new PonderClient(getNetworkConfig("mainnet", { queryDatabaseUrl: fixtureUrl }))
    try {
      const firstWave = Promise.all(Array.from({ length: 24 }, () => ponder.querySql("SELECT 1 AS n")))
      await expect(ponder.describeTable("pdp_data_set_created")).rejects.toThrow("Database busy")
      await firstWave
      expect((await ponder.querySql("SELECT 2 AS n")).rows).toEqual([{ n: 2 }])
    } finally {
      await ponder.close()
    }
  })

  test("losing a checked-out PostgreSQL session rejects only that request", async () => {
    const ponder = new PonderClient(getNetworkConfig("mainnet", { queryDatabaseUrl: fixtureUrl }))
    await fixture.query("BEGIN")
    try {
      await fixture.query("LOCK pdp_data_set_created IN ACCESS EXCLUSIVE MODE")
      const { rows: [holder] } = await fixture.query("SELECT pg_backend_pid() AS pid")
      const interrupted = ponder.querySql("SELECT id FROM pdp_data_set_created").then(
        () => false, () => true,
      )
      await vi.waitFor(async () => {
        const { rows } = await admin.query(
          "SELECT pid FROM pg_stat_activity WHERE datname = $1 AND $2 = ANY(pg_blocking_pids(pid))",
          [fixtureDatabase, holder.pid],
        )
        expect(rows).toHaveLength(1)
        await admin.query("SELECT pg_terminate_backend($1)", [rows[0].pid])
      })
      expect(await interrupted).toBe(true)
      expect((await ponder.querySql("SELECT 7 AS n")).rows).toEqual([{ n: 7 }])
    } finally {
      await fixture.query("ROLLBACK")
      await ponder.close()
    }
  })

  test("reports truncation only when another row exists, regardless of its width", async () => {
    await fixture.query("CREATE TABLE tx_meta (id integer PRIMARY KEY, status text)")
    await fixture.query("INSERT INTO tx_meta SELECT id, 'ok' FROM generate_series(1, 10000) id")
    const ponder = new PonderClient(getNetworkConfig("mainnet", { queryDatabaseUrl: fixtureUrl }))
    const sql = "SELECT status FROM tx_meta ORDER BY id"
    try {
      const exact = await ponder.querySql(sql)
      expect(exact.rowCount).toBe(10_000)
      expect(exact.truncated).toBeUndefined()
      await fixture.query("INSERT INTO tx_meta VALUES (10001, $1)", ["x".repeat(MAX_PG_ROW_BYTES + 1)])
      const capped = await ponder.querySql(sql)
      expect(capped.rowCount).toBe(10_000)
      expect(capped.truncated).toBe(true)
    } finally {
      await ponder.close()
    }
  })

  test("fetches a 2 MiB row below the PostgreSQL row guard", async () => {
    await fixture.query("INSERT INTO fwss_data_set_created (source) VALUES ($1)", ["x".repeat(2 * 1_024 * 1_024)])
    const ponder = new PonderClient(getNetworkConfig("calibnet", { queryDatabaseUrl: fixtureUrl }))
    try {
      const metrics: SqlSizeMetrics = {}
      const result = await ponder.querySql("SELECT source FROM fwss_data_set_created", metrics)
      expect(result.rows).toHaveLength(1)
      expect(metrics.maxRowBytes).toBe(Buffer.byteLength(JSON.stringify(result.rows[0]), "utf8"))
    } finally {
      await ponder.close()
    }
  })

  test("rejects oversized stored result rows before fetching them", async () => {
    await fixture.query("INSERT INTO fwss_data_set_created (source) VALUES ($1)", ["x".repeat(MAX_PG_ROW_BYTES + 1)])
    const ponder = new PonderClient(getNetworkConfig("calibnet", { queryDatabaseUrl: fixtureUrl }))
    try {
      const metrics: SqlSizeMetrics = {}
      await expect(ponder.querySql("SELECT source FROM fwss_data_set_created", metrics)).rejects.toThrow(/row exceeds/)
      expect(metrics.limitHit).toBe("pg_row")
    } finally {
      await ponder.close()
    }
  })
})
