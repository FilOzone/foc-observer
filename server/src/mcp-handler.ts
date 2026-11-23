/**
 * MCP server for remote HTTP transport.
 *
 * Same tools as the stdio client, but backed by direct Postgres/RPC access
 * instead of HTTP API calls. Used for the remote MCP endpoint that Claude.ai
 * and Claude Desktop can connect to without local installation.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { PonderClient } from "./ponder-client.js"
import type { ContractReader } from "./contract-reader.js"
import { DealbotClient } from "./dealbot-client.js"
import { sqlNotices } from "./tripwires.js"
import type { BetterStackClient } from "./betterstack-client.js"
import type { SubgraphClient } from "./subgraph-client.js"
import { ProvingClient } from "./proving-client.js"
import { resolveSystemContext } from "./system-context.js"
import type { NetworkName } from "./networks.js"
import { logMcp, logSql } from "./logger.js"

const networkEnum = z.enum(["calibnet", "mainnet"]).describe(
  "Which Filecoin network to query. Calibnet is the test network (high proving frequency, test data). Mainnet is production (real money, real storage providers).",
)


const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Expected an EVM address.")
const affirmation = z.preprocess(
  (val) => val === true || val === 1 || (typeof val === "string" && val.toLowerCase() === "true") || val === "1" ? true : val,
  z.literal(true),
).describe(
  "Set true after reading get_system_context for this analysis.",
)

function toolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] }
}

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/postgres:\/\/[^\s]+/g, "postgres://***")
    .replace(/password[=:]\s*\S+/gi, "password=***")
}

function toolError(err: unknown) {
  return {
    content: [{ type: "text" as const, text: `Error: ${sanitizeError(err)}` }],
    isError: true as const,
  }
}

/** Wrap a tool handler to log timing, params, and result metadata. */
function logged<P extends Record<string, unknown>>(
  toolName: string,
  handler: (params: P) => Promise<ReturnType<typeof toolResult> | ReturnType<typeof toolError>>,
): (params: P) => Promise<ReturnType<typeof toolResult> | ReturnType<typeof toolError>> {
  return async (params: P) => {
    const start = Date.now()
    try {
      const result = await handler(params)
      const durationMs = Date.now() - start
      const text = result.content[0]?.text ?? ""
      const opts: { resultChars: number; error?: string } = { resultChars: text.length }
      if ("isError" in result && result.isError) opts.error = text
      logMcp(toolName, params as Record<string, unknown>, durationMs, opts)
      return result
    } catch (err) {
      const durationMs = Date.now() - start
      logMcp(toolName, params as Record<string, unknown>, durationMs, { error: sanitizeError(err) })
      return toolError(err)
    }
  }
}

export function createMcpServer(
  ponderClients: Map<NetworkName, PonderClient>,
  contractReaders: Map<NetworkName, ContractReader>,
  betterstack?: BetterStackClient,
  subgraph?: SubgraphClient,
): McpServer {
  const dealbot = new DealbotClient()
  const { instructions, systemContext } = resolveSystemContext()

  function getPonder(network: NetworkName) {
    const client = ponderClients.get(network)
    if (!client) throw new Error(`Network "${network}" not configured`)
    return client
  }

  function getReader(network: NetworkName) {
    const reader = contractReaders.get(network)
    if (!reader) throw new Error(`Network "${network}" not configured`)
    return reader
  }

  const server = new McpServer({
    name: "foc-observer",
    version: "0.0.1",
  }, {
    instructions,
  })

  // -- Knowledge tool --

  server.registerTool("get_system_context", {
    description: "Start here for Filecoin Onchain Cloud (FOC) questions on mainnet or calibnet: who stores the data, whether uploads or IPFS retrievals work, whether providers prove storage, and what clients pay. Call once before analysis for the protocol guide and worked queries.",
    inputSchema: {},
  }, logged("get_system_context", async () => toolResult(systemContext)))

  // -- Ponder SQL tools --

  server.registerTool("query_sql", {
    description: "Analyze Filecoin Onchain Cloud history: storage growth, provider revenue, Filecoin Pay settlements and ARR, FilBeam egress, FIL burns, transaction gas or contract upgrades. Read-only SELECT over indexed events, up to 10,000 rows. Use list_tables and describe_table for the schema.",
    inputSchema: { i_have_read_the_system_context: affirmation, network: networkEnum, sql: z.string().describe("SQL SELECT query to execute") },
  }, logged("query_sql", async ({ network, sql }) => {
    const sqlStart = Date.now()
    try {
      const result = await getPonder(network).querySql(sql)
      logSql("mcp", network, sql, Date.now() - sqlStart, { rowCount: result.rowCount })
      const notices = sqlNotices(sql, result)
      return toolResult({ network, ...result, ...(notices.length ? { notices } : {}) })
    } catch (err) {
      logSql("mcp", network, sql, Date.now() - sqlStart, { error: sanitizeError(err) })
      return toolError(err)
    }
  }))

  server.registerTool("list_tables", {
    description: "Find indexed Filecoin storage, proof, payment and CDN event tables before writing SQL. Row counts are estimates.",
    inputSchema: { network: networkEnum },
  }, logged("list_tables", async ({ network }) => {
    try {
      const tables = await getPonder(network).listTables()
      return toolResult({ network, tables })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("describe_table", {
    description: "Get a table's columns, types, nullability and field notes, including token units where known.",
    inputSchema: { network: networkEnum, table: z.string().describe("Table name, e.g. 'fwss_fault_record'") },
  }, logged("describe_table", async ({ network, table }) => {
    try {
      const columns = await getPonder(network).describeTable(table)
      if (columns.length === 0) return toolResult({ network, error: `Table "${table}" not found.` })
      return toolResult({ network, table, columns })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_status", {
    description: "Check which FOC Observer databases are reachable on mainnet and calibnet. Returns table counts and estimated rows, not chain sync height.",
  }, logged("get_status", async () => {
    try {
      const statuses = await Promise.all(
        [...ponderClients.values()].map((c) => c.getStatus()),
      )
      return toolResult(statuses)
    } catch (err) { return toolError(err) }
  }))

  // -- Contract state tools --

  server.registerTool("get_providers", {
    description: "Which Filecoin warm storage providers are registered, approved or endorsed? List names, IDs, EVM addresses and capabilities. Read approval and endorsement independently; use this list to resolve providers for health queries.",
    inputSchema: { network: networkEnum },
  }, logged("get_providers", async ({ network }) => {
    try {
      const providers = await getReader(network).getAllProviders()
      return toolResult({ network, providers })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_provider", {
    description: "Look up one Filecoin warm storage provider by registry ID: name, provider wallet, payee and advertised PDP capabilities. Use get_providers to compare providers.",
    inputSchema: { network: networkEnum, providerId: z.string().describe("Provider ID, e.g. '6'") },
  }, logged("get_provider", async ({ network, providerId }) => {
    try {
      const provider = await getReader(network).getProvider(BigInt(providerId))
      return toolResult({ network, ...provider })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_dataset", {
    description: "Who stores and pays for this Filecoin warm storage dataset? Read its current FWSS provider, payer, payment rails, termination epoch, metadata and selected storage terms.",
    inputSchema: { i_have_read_the_system_context: affirmation, network: networkEnum, dataSetId: z.string().describe("Dataset ID, e.g. '11141'") },
  }, logged("get_dataset", async ({ network, dataSetId }) => {
    try {
      const dataset = await getReader(network).getDataset(BigInt(dataSetId))
      return toolResult({ network, ...dataset })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_dataset_proving", {
    description: "Is this PDP dataset live, how many pieces remain, and when is its next challenge? For FWSS datasets also check the current proving deadline and whether this period was proven. For historical missed proofs use get_proving_dataset.",
    inputSchema: { i_have_read_the_system_context: affirmation, network: networkEnum, dataSetId: z.string().describe("Dataset ID, e.g. '11141'") },
  }, logged("get_dataset_proving", async ({ network, dataSetId }) => {
    try {
      const proving = await getReader(network).getDatasetProving(BigInt(dataSetId))
      return toolResult({ network, ...proving })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_rail", {
    description: "Inspect a Filecoin Pay payment rail: who pays whom, in which token, at what rate, how much is locked, and through which epoch it has settled. Use query_sql for finalized rails or payment history.",
    inputSchema: { i_have_read_the_system_context: affirmation, network: networkEnum, railId: z.string().describe("Rail ID, e.g. '100'") },
  }, logged("get_rail", async ({ network, railId }) => {
    try {
      const rail = await getReader(network).getRail(BigInt(railId))
      return toolResult({ network, ...rail })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_pricing", {
    description: "What does Filecoin warm storage cost today? Read the FWSS version and its default price list: storage per TiB per month, the monthly per-dataset fee, CDN and cache-miss egress per TiB, one-time operation fees (fees), and lockup amounts and periods (lockups). Amounts are token base units with formatted equivalents. For the actual currency and terms on an existing dataset use get_dataset.",
    inputSchema: { network: networkEnum },
  }, logged("get_pricing", async ({ network }) => {
    try {
      const pricing = await getReader(network).getPricing()
      return toolResult({ network, ...pricing })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_auction", {
    description: "How much in Filecoin Pay token fees can be claimed by burning FIL? Read the live Dutch auction pool, start price and start time for that token. For historical claims and FIL burned use query_sql (fp_burn_for_fees).",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      token: address.describe("Token contract address"),
    },
  }, logged("get_auction", async ({ network, token }) => {
    try {
      const auction = await getReader(network).getAuctionStatus(token as `0x${string}`)
      return toolResult({ network, ...auction })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_account", {
    description: "How much can this Filecoin Pay wallet withdraw, how much is locked, and how long can it fund payments? Reads current balance and solvency for one owner and token. For native FIL use the full zero address.",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      token: address.describe("Token contract address or the 20-byte zero address for native FIL"),
      owner: address.describe("Account owner address"),
    },
  }, logged("get_account", async ({ network, token, owner }) => {
    try {
      const account = await getReader(network).getAccount(
        token as `0x${string}`,
        owner as `0x${string}`,
      )
      return toolResult({ network, ...account })
    } catch (err) { return toolError(err) }
  }))

  // -- DealBot tools --

  server.registerTool("get_dealbot_stats", {
    description: "Are Filecoin warm storage uploads and IPFS retrievals succeeding across the network? Returns DealBot probe counts and success rates, not customer traffic or proof-of-storage faults.",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      hours: z.number().describe("Time window in hours (default 72). Quantized to nearest tier.").default(72),
    },
  }, logged("get_dealbot_stats", async ({ network, hours }) => {
    if (betterstack?.isConfigured()) {
      try { return toolResult(await betterstack.getNetworkStats(network, hours)) }
      catch (err) { return toolError(err) }
    }
    try { return toolResult(await dealbot.getNetworkStats(network)) }
    catch (err) { return toolError(err) }
  }))

  server.registerTool("get_dealbot_providers", {
    description: "Compare storage providers by DealBot upload and IPFS retrieval success rate and sample count. Use get_proving_health for retention faults rather than retrieval failures.",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      hours: z.number().describe("Time window in hours (default 72)").default(72),
    },
  }, logged("get_dealbot_providers", async ({ network, hours }) => {
    if (betterstack?.isConfigured()) {
      try {
        const providers = await betterstack.getProviderMetrics(network, hours)
        return toolResult({ network, hours, providers })
      } catch (err) { return toolError(err) }
    }
    try { return toolResult(await dealbot.getProviderMetrics(network)) }
    catch (err) { return toolError(err) }
  }))

  server.registerTool("get_dealbot_provider_detail", {
    description: "Is one storage provider meeting its upload and IPFS retrieval targets? Look up DealBot success rates and sample counts by registry ID. Use 72 hours for SLA assessment.",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      providerId: z.string().describe("Provider ID (integer), e.g. '6'"),
      hours: z.number().describe("Time window in hours (default 72)").default(72),
    },
  }, logged("get_dealbot_provider_detail", async ({ network, providerId, hours }) => {
    if (betterstack?.isConfigured()) {
      try {
        const detail = await betterstack.getProviderDetail(network, providerId, hours)
        if (!detail) return toolResult({ network, error: `Provider "${providerId}" not found in metrics for the last ${hours}h.` })
        return toolResult({ network, hours, ...detail })
      } catch (err) { return toolError(err) }
    }
    return toolError(new Error("BetterStack not configured and DealBot provider detail requires EVM address, not providerId. Use get_providers to find the address."))
  }))

  server.registerTool("get_dealbot_daily", {
    description: "When did upload or IPFS retrieval reliability change? Get daily DealBot counts and success rates by storage provider to spot regressions.",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      days: z.number().describe("Days to look back (default 7)").default(7),
    },
  }, logged("get_dealbot_daily", async ({ network, days }) => {
    if (betterstack?.isConfigured()) {
      try {
        const data = await betterstack.getTimeSeries(network, days * 24, 24)
        return toolResult({ network, days, bucketSize: "24h", data })
      } catch (err) { return toolError(err) }
    }
    try { return toolResult(await dealbot.getDailyMetrics(network, days)) }
    catch (err) { return toolError(err) }
  }))

  server.registerTool("get_dealbot_failures", {
    description: "Why are Filecoin storage deals or IPFS retrieval probes failing? Get common DealBot errors and affected providers from its own failure database.",
    inputSchema: { i_have_read_the_system_context: affirmation, network: networkEnum },
  }, logged("get_dealbot_failures", async ({ network }) => {
    try {
      const [deals, retrievals] = await Promise.all([
        dealbot.getFailedDealsSummary(network),
        dealbot.getFailedRetrievalsSummary(network),
      ])
      return toolResult({ network, dealFailures: deals, retrievalFailures: retrievals })
    } catch (err) { return toolError(err) }
  }))

  // -- Proving health tools (local, from indexed events) --

  const provingClients = new Map<NetworkName, ProvingClient>()
  for (const [name, client] of ponderClients) {
    provingClients.set(name, new ProvingClient(client))
  }

  server.registerTool("get_proving_health", {
    description: "Is a Filecoin PDP storage provider missing proofs of data possession? Primary source for retention fault rates, weekly activity and affected datasets, inferred from gaps between indexed proving periods. Use the provider EVM address from get_providers. For upload or retrieval failures use DealBot.",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      address: z.string().describe("Provider's EVM address (0x...). Get from get_providers."),
      weeks: z.number().describe("Weeks of activity history (default 4)").default(4),
    },
  }, logged("get_proving_health", async ({ network, address, weeks }) => {
    const proving = provingClients.get(network)
    if (!proving) return toolError(new Error(`Network "${network}" not configured`))
    try {
      const health = await proving.getProviderHealth(address, weeks)
      if (!health) return toolResult({ network, error: `Provider "${address}" not found.` })
      return toolResult({ network, ...health })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_proving_dataset", {
    description: "Has this PDP dataset missed storage proofs over time? Get its last proof and period timestamps, observed cadence, proved and faulted periods, and fault rate. For the current challenge or deadline use get_dataset_proving.",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      dataSetId: z.string().describe("Dataset ID (integer), e.g. '11141'"),
    },
  }, logged("get_proving_dataset", async ({ network, dataSetId }) => {
    const proving = provingClients.get(network)
    if (!proving) return toolError(new Error(`Network "${network}" not configured`))
    try {
      const dataset = await proving.getDataset(dataSetId)
      if (!dataset) return toolResult({ network, error: `Dataset "${dataSetId}" not found.` })
      return toolResult({ network, ...dataset })
    } catch (err) { return toolError(err) }
  }))

  // -- Proving health tools (PDP Explorer subgraph via Goldsky, for cross-validation) --

  server.registerTool("get_proving_health_goldsky", {
    description: "Cross-check one provider’s proof-of-storage fault history against the independent Goldsky PDP Explorer subgraph. Use get_proving_health first; active dataset counts can differ.",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      address: z.string().describe("Provider's EVM address (0x...)."),
      weeks: z.number().describe("Weeks of activity history (default 4)").default(4),
    },
  }, logged("get_proving_health_goldsky", async ({ network, address, weeks }) => {
    if (!subgraph) return toolError(new Error("Subgraph client not configured"))
    try {
      const health = await subgraph.getProviderProvingHealth(network, address, weeks)
      if (!health) return toolResult({ network, error: `Provider "${address}" not found in PDP subgraph.` })
      return toolResult({ network, source: "goldsky-subgraph", ...health })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_proving_dataset_goldsky", {
    description: "Cross-check one dataset’s PDP proving history in the independent Goldsky subgraph when investigating a discrepancy with get_proving_dataset.",
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      dataSetId: z.string().describe("Dataset ID (integer), e.g. '11141'"),
    },
  }, logged("get_proving_dataset_goldsky", async ({ network, dataSetId }) => {
    if (!subgraph) return toolError(new Error("Subgraph client not configured"))
    try {
      const dataset = await subgraph.getDataset(network, dataSetId)
      if (!dataset) return toolResult({ network, source: "goldsky-subgraph", error: `Dataset "${dataSetId}" not found in PDP subgraph.` })
      return toolResult({ network, source: "goldsky-subgraph", ...dataset })
    } catch (err) { return toolError(err) }
  }))

  return server
}
