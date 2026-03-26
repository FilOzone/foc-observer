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
import { callToolAndClose, configureMcpUrl } from "./mcp-client.js"
import { serveProxy } from "./mcp-proxy.js"

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
  .version("0.0.1")
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
    await serveProxy(mcpUrl(program.opts()))
  })

program
  .command("query <sql>")
  .description("Execute a SQL query")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output raw JSON")
  .action(async (sql, opts) => {
    try {
      
      const result = await callToolAndClose("query_sql", { ...AFFIRM, network: opts.network, sql }) as Record<string, unknown>
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
      } else if ((result.rowCount as number) === 0) {
        console.log(`[${opts.network}] (no rows)`)
      } else {
        console.log(`[${opts.network}]`)
        printTable(result.columns as string[], result.rows as Record<string, unknown>[])
        console.log(`\n(${result.rowCount} rows)`)
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })

program
  .command("tables")
  .description("List all FOC event tables with row counts")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    try {
      
      const result = await callToolAndClose("list_tables", { network: opts.network }) as Record<string, unknown>
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      const tables = result.tables as Array<{ name: string; rowCount: number; description: string }>
      const nameW = Math.max("Table".length, ...tables.map((t) => t.name.length))
      const countW = Math.max("Rows".length, ...tables.map((t) => String(t.rowCount).length))
      console.log(`[${opts.network}]`)
      console.log(`${"Table".padEnd(nameW)} | ${"Rows".padStart(countW)} | Description`)
      console.log(`${"-".repeat(nameW)}-+-${"-".repeat(countW)}-+-${"-".repeat(40)}`)
      for (const t of tables) {
        console.log(`${t.name.padEnd(nameW)} | ${String(t.rowCount).padStart(countW)} | ${t.description}`)
      }
      const total = tables.reduce((s, t) => s + t.rowCount, 0)
      console.log(`\n${tables.length} tables, ${total.toLocaleString()} total rows`)
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })

program
  .command("describe <table>")
  .description("Show columns and types for a table")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output raw JSON")
  .action(async (table, opts) => {
    try {
      
      const result = await callToolAndClose("describe_table", { network: opts.network, table }) as Record<string, unknown>
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      const columns = result.columns as Array<{ name: string; type: string; nullable: boolean }>
      const nameW = Math.max("Column".length, ...columns.map((c) => c.name.length))
      const typeW = Math.max("Type".length, ...columns.map((c) => c.type.length))
      console.log(`[${opts.network}]`)
      console.log(`${"Column".padEnd(nameW)} | ${"Type".padEnd(typeW)} | Nullable`)
      console.log(`${"-".repeat(nameW)}-+-${"-".repeat(typeW)}-+-${"-".repeat(8)}`)
      for (const c of columns) {
        console.log(`${c.name.padEnd(nameW)} | ${c.type.padEnd(typeW)} | ${c.nullable ? "YES" : "NO"}`)
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })

program
  .command("status")
  .description("Check which networks are available")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    try {
      
      const raw = await callToolAndClose("get_status") as unknown
      const statuses = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, unknown>>
      if (opts.json) {
        console.log(JSON.stringify(statuses, null, 2))
        return
      }
      for (const s of statuses) {
        if (!s.reachable) {
          console.log(`[${s.network ?? s.name}] not reachable (${s.error})`)
        } else {
          console.log(`[${s.network ?? s.name}] ${s.tables} tables | ${(s.totalRows as number).toLocaleString()} rows`)
        }
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })

program
  .command("providers")
  .description("List all storage providers")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    try {
      
      const result = await callToolAndClose("get_providers", { network: opts.network }) as Record<string, unknown>
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }
      const providers = result.providers as Array<Record<string, unknown>>
      const nameW = Math.max("Name".length, ...providers.map((p) => String(p.name).length))
      console.log(`[${opts.network}]`)
      console.log(`${"ID".padStart(3)} | ${"Name".padEnd(nameW)} | Reg | Appr | End | Address`)
      console.log(`${"-".repeat(3)}-+-${"-".repeat(nameW)}-+-----+------+-----+-${"-".repeat(42)}`)
      for (const p of providers) {
        const reg = p.isActive ? " Y " : " - "
        const appr = p.isApproved ? "  Y  " : "  -  "
        const end = p.isEndorsed ? " Y " : " - "
        console.log(`${String(p.providerId).padStart(3)} | ${String(p.name).padEnd(nameW)} | ${reg} | ${appr} | ${end} | ${p.serviceProvider}`)
      }
      console.log(`\n${providers.length} providers`)
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })

program
  .command("provider <id>")
  .description("Look up a storage provider by ID")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output raw JSON")
  .action(async (id, opts) => {
    try {
      
      const p = await callToolAndClose("get_provider", { network: opts.network, providerId: id }) as Record<string, unknown>
      if (opts.json) {
        console.log(JSON.stringify(p, null, 2))
      } else {
        console.log(`[${opts.network}] ${p.name} (${p.providerId})`)
        console.log(`  Address:     ${p.serviceProvider}`)
        console.log(`  Payee:       ${p.payee}`)
        console.log(`  Active:      ${p.isActive}`)
        if (p.description) console.log(`  Description: ${p.description}`)
        const caps = p.capabilities as Record<string, string> | null
        if (caps && Object.keys(caps).length > 0) {
          console.log("  Capabilities:")
          for (const [k, v] of Object.entries(caps)) {
            console.log(`    ${k}: ${v}`)
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })

program
  .command("dataset <id>")
  .description("Look up a FWSS dataset by ID")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output raw JSON")
  .action(async (id, opts) => {
    try {
      
      const d = await callToolAndClose("get_dataset", { ...AFFIRM, network: opts.network, dataSetId: id }) as Record<string, unknown>
      if (opts.json) {
        console.log(JSON.stringify(d, null, 2))
      } else {
        console.log(`[${opts.network}] Dataset ${d.dataSetId}`)
        console.log(`  Provider:    ${d.providerId}`)
        console.log(`  Payer:       ${d.payer}`)
        console.log(`  Payee:       ${d.payee}`)
        console.log(`  Rails:       PDP=${d.pdpRailId} CDN=${d.cdnRailId} CacheMiss=${d.cacheMissRailId}`)
        console.log(`  Terminated:  ${d.terminated}${d.terminated ? ` (epoch ${d.pdpEndEpoch})` : ""}`)
        const meta = d.metadata as Record<string, string> | null
        if (meta && Object.keys(meta).length > 0) {
          console.log("  Metadata:")
          for (const [k, v] of Object.entries(meta)) {
            console.log(`    ${k}: ${v}`)
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })

program
  .command("rail <id>")
  .description("Look up a FilecoinPay payment rail")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output raw JSON")
  .action(async (id, opts) => {
    try {
      
      const r = await callToolAndClose("get_rail", { ...AFFIRM, network: opts.network, railId: id }) as Record<string, unknown>
      if (opts.json) {
        console.log(JSON.stringify(r, null, 2))
      } else {
        console.log(`[${opts.network}] Rail ${r.railId}`)
        console.log(`  From:       ${r.from}`)
        console.log(`  To:         ${r.to}`)
        console.log(`  Operator:   ${r.operator}`)
        console.log(`  Validator:  ${r.validator}`)
        console.log(`  Rate:       ${r.paymentRateFormatted}`)
        console.log(`  Settled to: epoch ${r.settledUpTo}`)
        console.log(`  Terminated: ${r.terminated}${r.terminated ? ` (epoch ${r.endEpoch})` : ""}`)
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })

program
  .command("pricing")
  .description("Get current FWSS storage pricing")
  .option("-n, --network <network>", "Network: calibnet or mainnet", resolveNetwork())
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    try {
      
      const p = await callToolAndClose("get_pricing", { network: opts.network }) as Record<string, unknown>
      if (opts.json) {
        console.log(JSON.stringify(p, null, 2))
      } else {
        console.log(`[${opts.network}] FWSS Pricing`)
        console.log(`  Storage: ${p.storagePriceFormatted}`)
        console.log(`  Minimum: ${p.minimumRateFormatted}`)
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL"
  if (typeof val === "bigint") return val.toString()
  return String(val)
}

function printTable(columns: string[], rows: Record<string, unknown>[]): void {
  const widths = columns.map((col) => {
    const values = rows.map((row) => formatValue(row[col]))
    return Math.min(60, Math.max(col.length, ...values.map((v) => v.length)))
  })
  const header = columns.map((col, i) => col.padEnd(widths[i])).join(" | ")
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
