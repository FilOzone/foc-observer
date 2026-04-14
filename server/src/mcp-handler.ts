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
import { formatTableList } from "./table-metadata.js"
import type { BetterStackClient } from "./betterstack-client.js"
import type { SubgraphClient } from "./subgraph-client.js"
import { ProvingClient } from "./proving-client.js"
import { resolveSystemContext } from "./system-context.js"
import type { NetworkName } from "./networks.js"
import { logMcp, logSql } from "./logger.js"

const networkEnum = z.enum(["calibnet", "mainnet"]).describe(
  "Which Filecoin network to query. Calibnet is the test network (high proving frequency, test data). Mainnet is production (real money, real storage providers).",
)

const affirmation = z.preprocess(
  (val) => val === true || val === 1 || (typeof val === "string" && val.toLowerCase() === "true") || val === "1" ? true : val,
  z.literal(true),
).describe(
  "You must call get_system_context first, then set this to true. This confirms you have loaded the FOC protocol knowledge required to correctly interpret results from this tool.",
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
    description: `MANDATORY FIRST CALL. Returns complete FOC protocol knowledge required for correct interpretation of all data from this server.

After calling this, you can use the other tools. Most tools require i_have_read_the_system_context: true to confirm you have loaded this context.

Call this exactly once at the start of your work. Do not skip it.`,
  }, logged("get_system_context", async () => toolResult(systemContext)))

  // -- Ponder SQL tools --

  server.registerTool("query_sql", {
    description: `Execute read-only SQL against FOC event data indexed from Filecoin contracts by Ponder.

All tables have: tx_hash, tx_from, tx_value, gas_used, effective_gas_price, block_number, timestamp.
Max 10,000 rows per query. System catalogs are blocked.

Tables and key columns:
${formatTableList()}

Key joins: fwss tables use data_set_id, pdp tables use set_id, these are the same value (JOIN fwss.data_set_id = pdp.set_id). rail_id across fp tables. Link rails to datasets: JOIN fwss_data_set_created.pdp_rail_id = fp_rail_settled.rail_id. Provider names: call get_providers first, then JOIN by provider_id.
Amounts are bigint (18 decimals). Gas cost in FIL = gas_used * effective_gas_price / 1e18.`,
    inputSchema: { i_have_read_the_system_context: affirmation, network: networkEnum, sql: z.string().describe("SQL SELECT query to execute") },
  }, logged("query_sql", async ({ network, sql }) => {
    const sqlStart = Date.now()
    try {
      const result = await getPonder(network).querySql(sql)
      logSql("mcp", network, sql, Date.now() - sqlStart, { rowCount: result.rowCount })
      return toolResult({ network, ...result })
    } catch (err) {
      logSql("mcp", network, sql, Date.now() - sqlStart, { error: sanitizeError(err) })
      return toolError(err)
    }
  }))

  server.registerTool("list_tables", {
    description: "List all FOC event tables with row counts and descriptions. Tables prefixed by contract: pdp_, fwss_, fp_, spr_, skr_.",
    inputSchema: { network: networkEnum },
  }, logged("list_tables", async ({ network }) => {
    try {
      const tables = await getPonder(network).listTables()
      return toolResult({ network, tables })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("describe_table", {
    description: "Get column names, types, and nullability for a specific FOC event table.",
    inputSchema: { network: networkEnum, table: z.string().describe("Table name, e.g. 'fwss_fault_record'") },
  }, logged("describe_table", async ({ network, table }) => {
    try {
      const columns = await getPonder(network).describeTable(table)
      if (columns.length === 0) return toolResult({ network, error: `Table "${table}" not found.` })
      return toolResult({ network, table, columns })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_status", {
    description: "Check connectivity and report which networks are available with table counts and row totals.",
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
    description: `List all registered storage providers with approval and endorsement status.

Three tiers: registered (isActive) < approved (isApproved, passes DealBot checks) < endorsed (isEndorsed, curated primary copy targets).
Call this for provider name resolution instead of calling get_provider repeatedly.`,
    inputSchema: { network: networkEnum },
  }, logged("get_providers", async ({ network }) => {
    try {
      const providers = await getReader(network).getAllProviders()
      return toolResult({ network, providers })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_provider", {
    description: 'Look up a single storage provider by ID. Prefer get_providers for bulk lookups. Show as "Name (ID)".',
    inputSchema: { network: networkEnum, providerId: z.string().describe("Provider ID, e.g. '6'") },
  }, logged("get_provider", async ({ network, providerId }) => {
    try {
      const provider = await getReader(network).getProvider(BigInt(providerId))
      return toolResult({ network, ...provider })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_dataset", {
    description: "Look up a FWSS dataset's current state. Returns rails, payer/payee, termination status, and metadata (source, withCDN).",
    inputSchema: { i_have_read_the_system_context: affirmation, network: networkEnum, dataSetId: z.string().describe("Dataset ID, e.g. '11141'") },
  }, logged("get_dataset", async ({ network, dataSetId }) => {
    try {
      const dataset = await getReader(network).getDataset(BigInt(dataSetId))
      return toolResult({ network, ...dataset })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_dataset_proving", {
    description: "Check live proving status of a dataset. Returns: live, provenThisPeriod, deadline, lastProvenEpoch, leafCount, activePieceCount.",
    inputSchema: { i_have_read_the_system_context: affirmation, network: networkEnum, dataSetId: z.string().describe("Dataset ID, e.g. '11141'") },
  }, logged("get_dataset_proving", async ({ network, dataSetId }) => {
    try {
      const proving = await getReader(network).getDatasetProving(BigInt(dataSetId))
      return toolResult({ network, ...proving })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_rail", {
    description: "Look up a FilecoinPay payment rail. Returns rate, lockup, settlement position, termination status.",
    inputSchema: { i_have_read_the_system_context: affirmation, network: networkEnum, railId: z.string().describe("Rail ID, e.g. '100'") },
  }, logged("get_rail", async ({ network, railId }) => {
    try {
      const rail = await getReader(network).getRail(BigInt(railId))
      return toolResult({ network, ...rail })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_pricing", {
    description: "Get current FWSS storage pricing. Returns storage price per TiB/month and minimum rate, formatted and raw.",
    inputSchema: { network: networkEnum },
  }, logged("get_pricing", async ({ network }) => {
    try {
      const pricing = await getReader(network).getPricing()
      return toolResult({ network, ...pricing })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_auction", {
    description: `Get the current fee auction status for a token in FilecoinPay.

FilecoinPay accumulates network fees from settlements. These fees are periodically auctioned off: keepers bid FIL (which is burned) to claim the accumulated token fees. The auction uses a Dutch auction mechanism, price starts high and decays over time.

Returns: accumulated fees available for auction, auction start price and time, and the network fee percentage.
Use USDFC token address (see system context for addresses per network) for the primary fee pool.

Historical auction completions are in the fp_burn_for_fees table (query_sql). This tool shows the current live state.`,
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      token: z.string().describe("Token contract address (typically USDFC)"),
    },
  }, logged("get_auction", async ({ network, token }) => {
    try {
      const auction = await getReader(network).getAuctionStatus(token as `0x${string}`)
      return toolResult({ network, ...auction })
    } catch (err) { return toolError(err) }
  }))

  server.registerTool("get_account", {
    description: `Look up a FilecoinPay account's balance and solvency status. Returns current funds, lockup obligations, available (withdrawable) funds, and the epoch until which the account is funded.

Requires both the token address and owner address. Use USDFC token address for storage payment accounts:
- Calibnet: 0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0
- Mainnet: 0x80B98d3aa09ffff255c3ba4A241111Ff1262F045
Use 0x0000000000000000000000000000000000000000 for native FIL accounts.

Key fields:
- funds: total deposited balance (before lockup deduction)
- lockupCurrent: total locked across all rails (cannot be withdrawn)
- availableFunds: funds minus lockup (what can be withdrawn)
- fundedUntilEpoch: the epoch until which payments are covered at current rates. If this is in the past, the account is delinquent.
- lockupRate: total streaming rate across all active rails`,
    inputSchema: {
      i_have_read_the_system_context: affirmation,
      network: networkEnum,
      token: z.string().describe("Token contract address (USDFC or 0x0 for FIL)"),
      owner: z.string().describe("Account owner address (0x...)"),
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
    description: `Network-wide deal and IPFS retrieval metrics from BetterStack Prometheus data (DealBot test results).

Returns: total deals, deal success rate, total IPFS retrievals, IPFS retrieval success rate, provider counts. Does NOT include retention/proving fault data, use get_proving_health for that.

Data source: BetterStack ClickHouse, querying Prometheus counters from DealBot. DealBot runs 4 deals + 4 retrievals per SP per hour. Per-series delta computation handles pod restart counter resets.

Supports flexible time windows (quantized to: 1h, 6h, 12h, 24h, 72h, 7d, 30d, 90d). Default: 72h. Sample counts ~10-15% lower than DealBot's actual counts due to Prometheus aggregation; success RATES are accurate.`,
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
    description: `All providers with deal and IPFS retrieval metrics from BetterStack Prometheus data (DealBot test results). Does NOT include retention/proving fault data, use get_proving_health for that.

Returns per provider: providerId, providerName, providerStatus, totalDeals, dealSuccessRate, totalIpfsRetrievals, ipfsRetrievalSuccessRate.

Default: 72h window (~288 deal checks, exceeds 200-check SLA minimum). Use hours=168 (7d) or hours=720 (30d) for longer trends. For SLA verdicts, use hours=72. For regression detection, compare hours=72 vs hours=720.`,
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
    description: `Single provider deal and IPFS retrieval metrics from BetterStack Prometheus data. Use providerId (integer) from get_providers. Does NOT include retention/proving, use get_proving_health for that.

Returns: same fields as get_dealbot_providers but for one provider. Use hours=72 for SLA assessments.`,
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
    description: `Daily deal and IPFS retrieval time-series from BetterStack Prometheus data. Returns per-day buckets with deal/retrieval counts and rates per provider.

Use for trend analysis, regression detection, provider dropoff tracking. Does NOT include retention/proving trends.`,
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
    description: `DealBot failure analysis from DealBot's own REST API (not BetterStack). Returns common deal and retrieval errors with affected providers.

Data source: DealBot NestJS backend database at dealbot.filoz.org (mainnet) / staging.dealbot.filoz.org (calibnet). Error categories: "fetch failed" = SP unreachable, 502 = backend down, "LockupNotSettledRateChangeNotAllowed" = payment contract issue.`,
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
    description: `Deep-dive into a storage provider's proving health. PRIMARY source for fault rates.

Computed from indexed PDPVerifier events using the proof-gap method: for each NextProvingPeriod event, checks whether a PossessionProven exists in the preceding window. No proof = fault. When an SP goes dark (epoch gap spans multiple proving periods), the skipped periods are inferred as faults. The proving period is derived per-dataset from observed data (not hardcoded), so this works for any listener contract (FWSS, Storacha, etc.).

activeDataSets counts only datasets that are not deleted, not emptied, and have proved in the last 3 days.

Returns: all-time fault rate, weekly activity breakdown (faults, proofs, datasets created, pieces added), per-dataset proving status with derived provingPeriod.

Requires the provider's EVM address (0x...). Call get_providers first to resolve providerId to address.

For cross-validation, use get_proving_health_goldsky (PDP Explorer subgraph, independent source with known accuracy issues).`,
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
    description: `Get proving status for a single dataset using the proof-gap method on indexed PDPVerifier events.

Returns: provingPeriod (derived from observed data, epochs), totalProvingPeriods (including inferred skipped), totalFaultedPeriods, totalProvedPeriods, lastPeriodTs, lastProofTs, faultRate. Operator-agnostic (works for FWSS, Storacha, any listener).

Uses the dataset's setId (same as dataSetId in FWSS). For cross-validation, use get_proving_dataset_goldsky.`,
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
    description: `Provider proving health from the PDP Explorer subgraph (Goldsky). Same data as get_proving_health but from an independent source.

Use this for cross-validation when accuracy is critical. Known issue: the subgraph inflates "active" proof set counts by ~35% (empty/stale datasets remain marked isActive). See FilOzone/pdp-explorer#89.`,
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
    description: `Dataset proving status from the PDP Explorer subgraph (Goldsky). Same data as get_proving_dataset but from an independent source. Use for cross-validation.`,
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
