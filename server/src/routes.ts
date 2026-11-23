/**
 * HTTP API routes for foc-observer.
 *
 * All responses are JSON. Success returns the data directly with a "network"
 * field. Errors return { error: string } with appropriate HTTP status codes.
 */

import { Hono, type Context } from "hono"
import { routePath } from "hono/route"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import type { PonderClient, SqlSizeMetrics } from "./ponder-client.js"
import { ContractReader } from "./contract-reader.js"
import type { DealbotClient } from "./dealbot-client.js"
import { BetterStackClient, parseBucket } from "./betterstack-client.js"
import { SubgraphClient } from "./subgraph-client.js"
import { ProvingClient } from "./proving-client.js"
import { InputError, MAX_REQUEST_BYTES, parseAddress, parseUint256 } from "./inputs.js"
import { publicErrorMessage, ServiceUnavailableError } from "./public-error.js"
import type { NetworkName } from "./networks.js"
import { logBackendError, logRest, logSql } from "./logger.js"
import { sqlNotices } from "./tripwires.js"

interface Backends {
  ponderClients: Map<NetworkName, PonderClient>
  contractReaders: Map<NetworkName, ContractReader>
  betterstack?: BetterStackClient
  subgraph: SubgraphClient
  dealbot: DealbotClient
}

function validNetwork(name: string): name is NetworkName {
  return name === "calibnet" || name === "mainnet"
}

function errorStatus(err: unknown): 400 | 500 | 503 {
  if (err instanceof ServiceUnavailableError) return 503
  return err instanceof InputError ? 400 : 500
}

function errorResponse(c: Context, err: unknown, network?: string) {
  logBackendError("rest", "request", err, network)
  return c.json({ ...(network === undefined ? {} : { network }), error: publicErrorMessage(err) }, errorStatus(err))
}

export function createRoutes(backends: Backends): Hono {
  const app = new Hono()

  app.onError((err, c) => errorResponse(c, err))
  app.use("*", cors())

  // Request logging
  app.use("*", async (c, next) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start
    logRest(c.req.method, routePath(c, -1), c.res.status, ms)
  })

  function getPonder(network: string): { ponder: PonderClient; network: NetworkName } | { error: string } {
    if (!validNetwork(network)) return { error: 'Expected network "calibnet" or "mainnet".' }
    const ponder = backends.ponderClients.get(network)
    if (!ponder) return { error: `Network "${network}" not configured.` }
    return { ponder, network }
  }

  function getReader(network: string): { reader: ContractReader; network: NetworkName } | { error: string } {
    if (!validNetwork(network)) return { error: 'Expected network "calibnet" or "mainnet".' }
    const reader = backends.contractReaders.get(network)
    if (!reader) return { error: `Network "${network}" not configured.` }
    return { reader, network }
  }

  // Health check, all networks
  app.get("/status", async (c) => {
    const statuses = await Promise.all(
      [...backends.ponderClients.entries()].map(async ([name, client]) => {
        const status = await client.getStatus()
        return { name, ...status }
      }),
    )
    return c.json(statuses)
  })

  // SQL query
  app.post("/sql", bodyLimit({
    maxSize: MAX_REQUEST_BYTES,
    onError: (c) => c.json({ error: "SQL request body too large." }, 413),
  }), async (c) => {
    const body = await c.req.json<{ network?: string; sql?: string }>().catch(() => null)
    if (typeof body?.sql !== "string" || !body.sql) {
      return c.json({ error: "Missing 'sql' field." }, 400)
    }
    const ctx = getPonder(body.network ?? "")
    if ("error" in ctx) return c.json(ctx, 400)
    const sqlStart = Date.now()
    const sizes: SqlSizeMetrics = {}
    try {
      const result = await ctx.ponder.querySql(body.sql, sizes)
      logSql("rest", ctx.network, body.sql, Date.now() - sqlStart, { rowCount: result.rowCount, ...sizes })
      const notices = sqlNotices(body.sql, result)
      return c.json({ network: ctx.network, ...result, ...(notices.length ? { notices } : {}) })
    } catch (err) {
      logSql("rest", ctx.network, body.sql, Date.now() - sqlStart, { error: err instanceof InputError ? "input" : "backend", ...sizes })
      return errorResponse(c, err, ctx.network)
    }
  })

  // List tables
  app.get("/tables/:network", async (c) => {
    const ctx = getPonder(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    try {
      const tables = await ctx.ponder.listTables()
      return c.json({ network: ctx.network, tables })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // Describe table
  app.get("/table/:network/:name", async (c) => {
    const ctx = getPonder(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    const name = c.req.param("name")
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) return c.json({ error: "Invalid table name." }, 400)
    try {
      const columns = await ctx.ponder.describeTable(name)
      if (columns.length === 0) {
        return c.json({ network: ctx.network, error: `Table "${name}" not found.` }, 404)
      }
      return c.json({ network: ctx.network, table: name, columns })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // All providers (enriched with approved + endorsed status)
  app.get("/providers/:network", async (c) => {
    const ctx = getReader(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    try {
      const startId = parseUint256(c.req.query("startId") ?? "1")
      return c.json({ network: ctx.network, ...await ctx.reader.getAllProviders(BigInt(startId)) })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // Single provider lookup
  app.get("/provider/:network/:id", async (c) => {
    const ctx = getReader(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    try {
      const provider = await ctx.reader.getProvider(BigInt(parseUint256(c.req.param("id"))))
      return c.json({ network: ctx.network, ...provider })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // Dataset lookup
  app.get("/dataset/:network/:id", async (c) => {
    const ctx = getReader(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    try {
      const dataset = await ctx.reader.getDataset(BigInt(parseUint256(c.req.param("id"))))
      return c.json({ network: ctx.network, ...dataset })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // Dataset proving status
  app.get("/dataset/:network/:id/proving", async (c) => {
    const ctx = getReader(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    try {
      const proving = await ctx.reader.getDatasetProving(BigInt(parseUint256(c.req.param("id"))))
      return c.json({ network: ctx.network, ...proving })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // Rail lookup
  app.get("/rail/:network/:id", async (c) => {
    const ctx = getReader(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    try {
      const rail = await ctx.reader.getRail(BigInt(parseUint256(c.req.param("id"))))
      return c.json({ network: ctx.network, ...rail })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // Pricing
  app.get("/pricing/:network", async (c) => {
    const ctx = getReader(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    try {
      const pricing = await ctx.reader.getPricing()
      return c.json({ network: ctx.network, ...pricing })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // Auction status
  app.get("/auction/:network/:token", async (c) => {
    const ctx = getReader(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    try {
      const token = parseAddress(c.req.param("token")) as `0x${string}`
      const auction = await ctx.reader.getAuctionStatus(token)
      return c.json({ network: ctx.network, ...auction })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // Account lookup
  app.get("/account/:network/:token/:owner", async (c) => {
    const ctx = getReader(c.req.param("network"))
    if ("error" in ctx) return c.json(ctx, 400)
    try {
      const token = parseAddress(c.req.param("token")) as `0x${string}`
      const owner = parseAddress(c.req.param("owner")) as `0x${string}`
      const account = await ctx.reader.getAccount(token, owner)
      return c.json({ network: ctx.network, ...account })
    } catch (err) {
      return errorResponse(c, err, ctx.network)
    }
  })

  // -- BetterStack-backed metrics routes --

  const betterstack = backends.betterstack

  app.get("/metrics/providers/:network", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    if (!betterstack?.isConfigured()) return c.json({ error: "BetterStack metrics not configured." }, 503)
    const hours = Number(c.req.query("hours") ?? "72")
    const bucket = c.req.query("bucket")
    try {
      if (bucket) {
        const bucketHours = parseBucket(bucket)
        const data = await betterstack.getTimeSeries(network, hours, bucketHours)
        return c.json({ network, hours, bucket, data })
      }
      const providers = await betterstack.getProviderMetrics(network, hours)
      return c.json({ network, hours, providers })
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  app.get("/metrics/provider/:network/:id", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    if (!betterstack?.isConfigured()) return c.json({ error: "BetterStack metrics not configured." }, 503)
    const providerId = c.req.param("id")
    const hours = Number(c.req.query("hours") ?? "72")
    try {
      const provider = await betterstack.getProviderDetail(network, providerId, hours)
      if (!provider) return c.json({ network, error: `Provider "${providerId}" not found in metrics.` }, 404)
      return c.json({ network, hours, ...provider })
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  app.get("/metrics/network/:network", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    if (!betterstack?.isConfigured()) return c.json({ error: "BetterStack metrics not configured." }, 503)
    const hours = Number(c.req.query("hours") ?? "72")
    try {
      const stats = await betterstack.getNetworkStats(network, hours)
      return c.json(stats)
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  // -- Proving routes (local, from indexed events) --

  const provingClients = new Map<NetworkName, ProvingClient>()
  for (const [name, client] of backends.ponderClients) {
    provingClients.set(name, new ProvingClient(client))
  }

  app.get("/proving/provider/:network/:address", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    const proving = provingClients.get(network)
    if (!proving) return c.json({ error: `Network "${network}" not configured.` }, 400)
    const address = c.req.param("address")
    const weeks = Number(c.req.query("weeks") ?? "4")
    try {
      const health = await proving.getProviderHealth(address, weeks)
      if (!health) return c.json({ network, error: `Provider "${address}" not found.` }, 404)
      return c.json({ network, ...health })
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  app.get("/proving/dataset/:network/:setId", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    const proving = provingClients.get(network)
    if (!proving) return c.json({ error: `Network "${network}" not configured.` }, 400)
    try {
      const dataset = await proving.getDataset(c.req.param("setId"))
      if (!dataset) return c.json({ network, error: `Dataset "${c.req.param("setId")}" not found.` }, 404)
      return c.json({ network, ...dataset })
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  app.get("/proving/providers/:network", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    const proving = provingClients.get(network)
    if (!proving) return c.json({ error: `Network "${network}" not configured.` }, 400)
    try {
      const providers = await proving.getProviders()
      return c.json({ network, providers })
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  // -- Goldsky subgraph proving routes (for cross-validation) --

  const subgraph = backends.subgraph

  app.get("/proving/goldsky/provider/:network/:address", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    const weeks = Number(c.req.query("weeks") ?? "4")
    try {
      const health = await subgraph.getProviderProvingHealth(network, c.req.param("address"), weeks)
      if (!health) return c.json({ network, error: `Provider not found in subgraph.` }, 404)
      return c.json({ network, source: "goldsky-subgraph", ...health })
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  app.get("/proving/goldsky/providers/:network", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    try {
      const providers = await subgraph.getProviders(network)
      return c.json({ network, source: "goldsky-subgraph", providers })
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  // -- DealBot proxy routes (DealBot API blocks cross-origin requests) --

  const { dealbot } = backends

  app.get("/dealbot/stats/:network", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    try {
      return c.json(await dealbot.getNetworkStats(network))
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  app.get("/dealbot/providers/:network", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    try {
      return c.json(await dealbot.getProviderMetrics(network))
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  app.get("/dealbot/provider/:network/:addr", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    const preset = (c.req.query("preset") ?? "7d") as string
    try {
      return c.json(await dealbot.getProviderWindow(network, c.req.param("addr"), preset))
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  app.get("/dealbot/daily/:network", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    const days = Number(c.req.query("days") ?? "7")
    try {
      return c.json(await dealbot.getDailyMetrics(network, days))
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  app.get("/dealbot/failures/:network", async (c) => {
    const network = c.req.param("network")
    if (!validNetwork(network)) return c.json({ error: "Invalid network." }, 400)
    try {
      const [deals, retrievals] = await Promise.all([
        dealbot.getFailedDealsSummary(network),
        dealbot.getFailedRetrievalsSummary(network),
      ])
      return c.json({ network, dealFailures: deals, retrievalFailures: retrievals })
    } catch (err) {
      return errorResponse(c, err, network)
    }
  })

  return app
}
