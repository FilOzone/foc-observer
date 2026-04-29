/**
 * foc-observer HTTP API server.
 *
 * Serves two interfaces:
 * - REST API at /status, /sql, /providers, etc. (consumed by @filoz/foc-observer client)
 * - MCP endpoint at /mcp (Streamable HTTP transport for Claude.ai remote MCP connectors)
 */

import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { PonderClient } from "./ponder-client.js"
import { ContractReader } from "./contract-reader.js"
import { BetterStackClient } from "./betterstack-client.js"
import { SubgraphClient } from "./subgraph-client.js"
import { createRoutes } from "./routes.js"
import { createMcpServer } from "./mcp-handler.js"
import { ALL_NETWORKS, getNetworkConfig, type NetworkName } from "./networks.js"
import { logStartup } from "./logger.js"
import { initParser } from "./sql-validator.js"

const PORT = Number(process.env.FOC_SERVER_PORT ?? 17824)

const networkConfigs = new Map<NetworkName, import("./networks.js").NetworkConfig>()
const ponderClients = new Map<NetworkName, PonderClient>()
const contractReaders = new Map<NetworkName, ContractReader>()

for (const name of ALL_NETWORKS) {
  const config = getNetworkConfig(name)
  networkConfigs.set(name, config)
  ponderClients.set(name, new PonderClient(config))
  contractReaders.set(name, new ContractReader(config))
}

// BetterStack ClickHouse client (optional)
let betterstack: BetterStackClient | undefined
const bsUser = process.env.BETTERSTACK_CH_USER
const bsPass = process.env.BETTERSTACK_CH_PASSWORD
if (bsUser && bsPass) {
  betterstack = new BetterStackClient(bsUser, bsPass)
}

// PDP Explorer subgraph client
const subgraph = new SubgraphClient(networkConfigs)

// REST API routes
const restApp = createRoutes({ ponderClients, contractReaders, betterstack, subgraph })

// Combined Hono app: REST + MCP
const app = new Hono()

// Mount REST routes
app.route("/", restApp)

// MCP endpoint (Streamable HTTP transport, stateless)
app.all("/mcp", async (c) => {
  const mcpServer = createMcpServer(ponderClients, contractReaders, betterstack, subgraph)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await mcpServer.connect(transport)
  const response = await transport.handleRequest(c.req.raw)
  return response
})

await initParser()

// Create read-only views in the public schema for agent queries. Idempotent
// (CREATE OR REPLACE), so it's safe to re-run on every startup. Survives v2
// reindexes — when the postgres volume is swapped, the view is recreated on
// the next server boot.
for (const client of ponderClients.values()) {
  await client.bootstrapViews()
}

logStartup(PORT, ALL_NETWORKS, !!betterstack)
console.log(`foc-observer server starting on port ${PORT}`)

for (const [name, client] of ponderClients) {
  const config = client.network
  console.log(`  ${name}: postgres=${config.databaseUrl.replace(/\/\/.*@/, "//***@")} rpc=${config.rpcUrl}`)
}
console.log(`  BetterStack: ${betterstack ? "configured" : "not configured (set BETTERSTACK_CH_USER/PASSWORD)"}`)
if (process.env.FOC_LOG_PATH) console.log(`  Log file: ${process.env.FOC_LOG_PATH}`)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`foc-observer server listening on http://localhost:${info.port}`)
  console.log(`  REST API: http://localhost:${info.port}/status`)
  console.log(`  MCP endpoint: http://localhost:${info.port}/mcp`)
})
