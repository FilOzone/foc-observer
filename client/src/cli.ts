#!/usr/bin/env node

/**
 * foc-observer CLI and MCP server.
 *
 * MCP mode (for Claude Code / Desktop):
 *   foc-observer serve
 *
 * CLI mode (for humans and scripts):
 *   foc-observer query -n mainnet "SELECT ..."
 *   foc-observer tables -n mainnet
 *   foc-observer provider -n mainnet 1
 *
 * All data comes from the remote MCP server at FOC_API_URL.
 */

import { program } from "commander"
import { callTool, callToolAndClose, configureMcpUrl, createMcpClient } from "./mcp-client.js"
import { serveProxy } from "./mcp-proxy.js"
import { escapeTerminalText, formatTerminalValue, stringifyTerminalSafeJson } from "./terminal.js"
import { listProviderPages, type ProviderPageResult } from "./provider-pages.js"
import { VERSION } from "./version.js"

type NetworkName = "calibnet" | "mainnet"

function resolveNetwork(): NetworkName {
  const env = process.env.FOC_NETWORK
  if (env === "mainnet" || env === "calibnet") return env
  return "mainnet"
}

function resolveApiUrl(opts?: { apiUrl?: string }): string {
  const base = opts?.apiUrl ?? process.env.FOC_API_URL
  if (!base) throw new Error("FOC_API_URL environment variable or --api-url is required")
  return base.replace(/\/$/, "")
}

function mcpUrl(opts?: { apiUrl?: string }): string {
  return `${resolveApiUrl(opts)}/mcp`
}

/** Affirmation param, we always send true since we're a CLI, not an agent. */
const AFFIRM = { i_have_read_the_system_context: true }


program
  .name("foc-observer")
  .description("FOC observability - MCP server and CLI for querying Filecoin Onchain Cloud data")
  .version(VERSION)
  .option("--api-url <url>", "foc-observer server URL (overrides FOC_API_URL env var)")

// Configure MCP URL from global --api-url option before any command runs
program.hook("preAction", () => {
  const opts = program.opts()
  const apiUrl = opts.apiUrl ?? process.env.FOC_API_URL
  if (apiUrl) configureMcpUrl(apiUrl)
})

program
  .command("serve")
  .description("Run as MCP server (stdio transport, proxies to remote foc-observer)")
  .action(async () => {
    try {
      await serveProxy(mcpUrl(program.opts()))
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

program
  .command("query <sql>")
  .description("Execute a SQL query")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output JSON")
  .action(async (sql, opts) => {
    try {
      
      const result = await callToolAndClose("query_sql", { ...AFFIRM, network: opts.network, sql }) as Record<string, unknown>
      if (opts.json) {
        console.log(stringifyTerminalSafeJson(result))
      } else if ((result.rowCount as number) === 0) {
        console.log(`[${escapeTerminalText(opts.network)}] (no rows)`)
      } else {
        console.log(`[${escapeTerminalText(opts.network)}]`)
        printTable(result.columns as string[], result.rows as Record<string, unknown>[])
        console.log(`\n(${formatTerminalValue(result.rowCount)} rows${result.truncated ? ", truncated" : ""})`)
      }
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

program
  .command("tables")
  .description("List all FOC event tables with row counts")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output JSON")
  .action(async (opts) => {
    try {
      
      const result = await callToolAndClose("list_tables", { network: opts.network }) as Record<string, unknown>
      if (opts.json) {
        console.log(stringifyTerminalSafeJson(result))
        return
      }
      const tables = result.tables as Array<{ name: string; rowCount: number; description: string }>
      const nameW = Math.max("Table".length, ...tables.map((t) => formatTerminalValue(t.name).length))
      const countW = Math.max("Rows".length, ...tables.map((t) => formatTerminalValue(t.rowCount).length))
      console.log(`[${escapeTerminalText(opts.network)}]`)
      console.log(`${"Table".padEnd(nameW)} | ${"Rows".padStart(countW)} | Description`)
      console.log(`${"-".repeat(nameW)}-+-${"-".repeat(countW)}-+-${"-".repeat(40)}`)
      for (const t of tables) {
        console.log(`${formatTerminalValue(t.name).padEnd(nameW)} | ${formatTerminalValue(t.rowCount).padStart(countW)} | ${formatTerminalValue(t.description)}`)
      }
      const rowCounts = tables.map((table) => table.rowCount)
      const total = rowCounts.every((count) => typeof count === "number" && Number.isFinite(count))
        ? rowCounts.reduce((sum, count) => sum + count, 0)
        : null
      console.log(`\n${tables.length} tables, ${total === null ? "unknown" : formatCount(total)} total rows`)
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

program
  .command("describe <table>")
  .description("Show columns and types for a table")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output JSON")
  .action(async (table, opts) => {
    try {
      
      const result = await callToolAndClose("describe_table", { network: opts.network, table }) as Record<string, unknown>
      if (opts.json) {
        console.log(stringifyTerminalSafeJson(result))
        return
      }
      if (typeof result.error === "string") throw new Error(result.error)
      const columns = result.columns as Array<{ name: string; type: string; nullable: boolean }>
      const nameW = Math.max("Column".length, ...columns.map((c) => formatTerminalValue(c.name).length))
      const typeW = Math.max("Type".length, ...columns.map((c) => formatTerminalValue(c.type).length))
      console.log(`[${escapeTerminalText(opts.network)}]`)
      console.log(`${"Column".padEnd(nameW)} | ${"Type".padEnd(typeW)} | Nullable`)
      console.log(`${"-".repeat(nameW)}-+-${"-".repeat(typeW)}-+-${"-".repeat(8)}`)
      for (const c of columns) {
        console.log(`${formatTerminalValue(c.name).padEnd(nameW)} | ${formatTerminalValue(c.type).padEnd(typeW)} | ${c.nullable ? "YES" : "NO"}`)
      }
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

program
  .command("status")
  .description("Check which networks are available")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    try {
      
      const raw = await callToolAndClose("get_status") as unknown
      const statuses = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, unknown>>
      if (opts.json) {
        console.log(stringifyTerminalSafeJson(statuses))
        return
      }
      for (const s of statuses) {
        if (!s.reachable) {
          console.log(`[${formatTerminalValue(s.network ?? s.name)}] not reachable (${formatTerminalValue(s.error)})`)
        } else {
          console.log(`[${formatTerminalValue(s.network ?? s.name)}] ${formatTerminalValue(s.tables)} tables | ${Number(s.totalRows).toLocaleString()} rows`)
        }
      }
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

program
  .command("providers")
  .description("List storage providers")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--start-id <id>", "First provider ID")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    try {
      const client = await createMcpClient()
      let result: ProviderPageResult
      try {
        result = await listProviderPages(
          async (startId) => await callTool(client, "get_providers", {
            network: opts.network,
            ...(startId === undefined ? {} : { startId }),
          }) as ProviderPageResult,
          opts.startId,
        )
      } finally {
        await client.close()
      }
      if (opts.json) {
        console.log(stringifyTerminalSafeJson(result))
        return
      }
      const providers = result.providers as Array<Record<string, unknown>>
      const names = providers.map((provider) => formatTerminalValue(provider.name))
      const nameW = Math.min(60, Math.max("Name".length, ...names.map((name) => name.length)))
      console.log(`[${escapeTerminalText(opts.network)}]`)
      console.log(`${"ID".padStart(3)} | ${"Name".padEnd(nameW)} | Reg | Appr | End | Address`)
      console.log(`${"-".repeat(3)}-+-${"-".repeat(nameW)}-+-----+------+-----+-${"-".repeat(42)}`)
      for (let index = 0; index < providers.length; index++) {
        const p = providers[index]
        const reg = p.isActive ? " Y " : " - "
        const appr = p.isApproved === null ? "  ?  " : p.isApproved ? "  Y  " : "  -  "
        const end = p.isEndorsed === null ? " ? " : p.isEndorsed ? " Y " : " - "
        const name = names[index].length > nameW ? names[index].slice(0, nameW - 1) + "~" : names[index]
        console.log(`${formatTerminalValue(p.providerId).padStart(3)} | ${name.padEnd(nameW)} | ${reg} | ${appr} | ${end} | ${formatTerminalValue(p.serviceProvider)}`)
      }
      const total = formatTerminalValue(result.total ?? providers.length)
      const unavailable = Array.isArray(result.unavailableProviderIds)
        ? result.unavailableProviderIds.map(formatTerminalValue)
        : []
      const state = result.truncated === true ? " (truncated)" : result.complete === false ? " (incomplete)" : ""
      console.log(`\n${providers.length} of ${total} providers${state}`)
      if (result.providerStatusAvailable === false) console.log("? = status unavailable")
      if (result.capabilitiesAvailable === false) console.log("? = capability data unavailable")
      if (unavailable.length > 0) console.log(`Unavailable provider IDs: ${unavailable.join(", ")}`)
      if (result.nextId !== null && result.nextId !== undefined) {
        console.log(`Next page: foc-observer providers --network ${escapeTerminalText(opts.network)} --start-id ${formatTerminalValue(result.nextId)}`)
      }
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

program
  .command("provider <id>")
  .description("Look up a storage provider by ID")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output JSON")
  .action(async (id, opts) => {
    try {
      
      const p = await callToolAndClose("get_provider", { network: opts.network, providerId: id }) as Record<string, unknown>
      if (opts.json) {
        console.log(stringifyTerminalSafeJson(p))
      } else {
        console.log(`[${escapeTerminalText(opts.network)}] ${formatTerminalValue(p.name)} (${formatTerminalValue(p.providerId)})`)
        console.log(`  Address:     ${formatTerminalValue(p.serviceProvider)}`)
        console.log(`  Payee:       ${formatTerminalValue(p.payee)}`)
        console.log(`  Active:      ${formatTerminalValue(p.isActive)}`)
        if (p.description) console.log(`  Description: ${formatTerminalValue(p.description)}`)
        if (p.capabilitiesAvailable === false) {
          console.log("  Capabilities: unavailable")
        } else {
          const caps = p.capabilities as Record<string, string> | null
          if (caps && Object.keys(caps).length > 0) {
            console.log("  Capabilities:")
            for (const [k, v] of Object.entries(caps)) {
              console.log(`    ${formatTerminalValue(k)}: ${formatTerminalValue(v)}`)
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

program
  .command("dataset <id>")
  .description("Look up a FWSS dataset by ID")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output JSON")
  .action(async (id, opts) => {
    try {
      
      const d = await callToolAndClose("get_dataset", { ...AFFIRM, network: opts.network, dataSetId: id }) as Record<string, unknown>
      if (opts.json) {
        console.log(stringifyTerminalSafeJson(d))
      } else {
        console.log(`[${escapeTerminalText(opts.network)}] Dataset ${formatTerminalValue(d.dataSetId)}`)
        console.log(`  Provider:    ${formatTerminalValue(d.providerId)}`)
        console.log(`  Payer:       ${formatTerminalValue(d.payer)}`)
        console.log(`  Payee:       ${formatTerminalValue(d.payee)}`)
        console.log(`  Rails:       PDP=${formatTerminalValue(d.pdpRailId)} CDN=${formatTerminalValue(d.cdnRailId)} CacheMiss=${formatTerminalValue(d.cacheMissRailId)}`)
        console.log(`  Terminated:  ${formatTerminalValue(d.terminated)}${d.terminated ? ` (epoch ${formatTerminalValue(d.pdpEndEpoch)})` : ""}`)
        const meta = d.metadata as Record<string, string> | null
        if (meta && Object.keys(meta).length > 0) {
          console.log("  Metadata:")
          for (const [k, v] of Object.entries(meta)) {
            console.log(`    ${formatTerminalValue(k)}: ${formatTerminalValue(v)}`)
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

program
  .command("rail <id>")
  .description("Look up a FilecoinPay payment rail")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output JSON")
  .action(async (id, opts) => {
    try {
      
      const r = await callToolAndClose("get_rail", { ...AFFIRM, network: opts.network, railId: id }) as Record<string, unknown>
      if (opts.json) {
        console.log(stringifyTerminalSafeJson(r))
      } else {
        console.log(`[${escapeTerminalText(opts.network)}] Rail ${formatTerminalValue(r.railId)}`)
        console.log(`  From:       ${formatTerminalValue(r.from)}`)
        console.log(`  To:         ${formatTerminalValue(r.to)}`)
        console.log(`  Operator:   ${formatTerminalValue(r.operator)}`)
        console.log(`  Validator:  ${formatTerminalValue(r.validator)}`)
        console.log(`  Rate:       ${formatTerminalValue(r.paymentRateFormatted ?? `${r.paymentRate} base units/epoch (${r.token})`)}`)
        console.log(`  Settled to: epoch ${formatTerminalValue(r.settledUpTo)}`)
        console.log(`  Terminated: ${formatTerminalValue(r.terminated)}${r.terminated ? ` (epoch ${formatTerminalValue(r.endEpoch)})` : ""}`)
      }
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

program
  .command("pricing")
  .description("Get current FWSS storage pricing")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output JSON")
  .action(async (opts) => {
    try {
      
      const p = await callToolAndClose("get_pricing", { network: opts.network }) as Record<string, unknown>
      if (opts.json) {
        console.log(stringifyTerminalSafeJson(p))
      } else {
        console.log(`[${escapeTerminalText(opts.network)}] FWSS ${formatTerminalValue(p.fwssVersion)}`)
        console.log(`  Storage:     ${formatTerminalValue(p.storagePriceFormatted ?? `${p.storagePrice} base units/TiB/month (${p.token})`)}`)
        console.log(`  Dataset fee: ${formatTerminalValue(p.datasetFeePerMonthFormatted ?? `${p.datasetFeePerMonth} base units/month (${p.token})`)}`)
      }
    } catch (err) {
      console.error(`Error: ${escapeTerminalText(err instanceof Error ? err.message : String(err))}`)
      process.exit(1)
    }
  })

function formatValue(val: unknown): string {
  return formatTerminalValue(val)
}


function formatCount(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
    : formatTerminalValue(value)
}
function printTable(columns: string[], rows: Record<string, unknown>[]): void {
  const widths = columns.map((col) => {
    const values = rows.map((row) => formatValue(row[col]))
    return Math.min(60, Math.max(formatTerminalValue(col).length, ...values.map((v) => v.length)))
  })
  const header = columns.map((col, i) => formatTerminalValue(col).padEnd(widths[i])).join(" | ")
  const separator = widths.map((w) => "-".repeat(w)).join("-+-")
  console.log(header)
  console.log(separator)
  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const val = formatValue(row[col])
        return val.length > widths[i] ? val.slice(0, widths[i] - 1) + "~" : val.padEnd(widths[i])
      })
      .join(" | ")
    console.log(line)
  }
}

program.parse()
