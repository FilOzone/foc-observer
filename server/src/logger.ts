/**
 * Structured JSON logger for foc-observer.
 *
 * Writes JSON lines to stdout and optionally to a persistent log file.
 * Every entry has a type field for filtering:
 *   mcp     -- MCP tool calls (tool name, params, duration, result size)
 *   rest    -- HTTP REST requests (method, path, status, duration)
 *   sql     -- SQL queries (full text, network, rows, duration, tables touched)
 *   startup -- Server config snapshot
 *
 * Analysis examples:
 *   # Tool call frequency
 *   jq -r 'select(.type=="mcp") | .tool' < foc-observer.jsonl | sort | uniq -c | sort -rn
 *
 *   # Slow SQL queries (> 500ms)
 *   jq 'select(.type=="sql" and .durationMs > 500)' < foc-observer.jsonl
 *
 *   # Agent query patterns: which tables are queried most
 *   jq -r 'select(.type=="sql") | .tables[]?' < foc-observer.jsonl | sort | uniq -c | sort -rn
 *
 *   # Tool call sequences (consecutive pairs)
 *   jq -r 'select(.type=="mcp") | .tool' < foc-observer.jsonl | paste - - | sort | uniq -c | sort -rn
 *
 *   # Average duration per tool
 *   jq -r 'select(.type=="mcp") | [.tool, .durationMs] | @tsv' < foc-observer.jsonl | \
 *     awk '{sum[$1]+=$2; cnt[$1]++} END {for(t in sum) printf "%s\t%.0f\t%d\n", t, sum[t]/cnt[t], cnt[t]}' | sort -k2 -rn
 *
 *   # Network preference
 *   jq -r 'select(.type=="mcp" and .params.network) | .params.network' < foc-observer.jsonl | sort | uniq -c
 *
 *   # Errors by tool
 *   jq 'select(.type=="mcp" and .error) | {tool, error}' < foc-observer.jsonl
 *
 *   # SQL queries with seq scans (for index tuning)
 *   jq 'select(.type=="sql" and .slow)' < foc-observer.jsonl
 */

import { appendFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const LOG_PATH = process.env.FOC_LOG_PATH || ""
const SLOW_QUERY_MS = 500

let logReady: Promise<void> | undefined

async function ensureLogDir(): Promise<void> {
  if (!LOG_PATH) return
  const dir = dirname(LOG_PATH)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

export interface McpLogEntry {
  type: "mcp"
  ts: string
  tool: string
  params: Record<string, unknown>
  durationMs: number
  resultChars?: number
  error?: string
}

export interface RestLogEntry {
  type: "rest"
  ts: string
  method: string
  path: string
  status: number
  durationMs: number
}

export interface SqlLogEntry {
  type: "sql"
  ts: string
  via: "rest" | "mcp"
  network: string
  sql: string
  durationMs: number
  rowCount?: number
  tables?: string[]
  slow?: boolean
  error?: string
}

export interface StartupLogEntry {
  type: "startup"
  ts: string
  port: number
  networks: string[]
  betterstack: boolean
}

type LogEntry = McpLogEntry | RestLogEntry | SqlLogEntry | StartupLogEntry

// MCP transport keys that are not tool params
const TRANSPORT_KEYS = new Set(["signal", "_meta", "requestId", "requestInfo"])

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (k === "i_have_read_the_system_context") continue
    if (TRANSPORT_KEYS.has(k)) continue
    if (k === "sql" && typeof v === "string") {
      out[k] = v.length > 1000 ? v.slice(0, 1000) + "..." : v
    } else {
      out[k] = v
    }
  }
  // Extract useful caller info from MCP transport metadata
  const reqInfo = params.requestInfo as Record<string, unknown> | undefined
  const headers = reqInfo?.headers as Record<string, string> | undefined
  if (headers) {
    if (headers["user-agent"]) out._ua = headers["user-agent"]
    if (headers["x-real-ip"]) out._ip = headers["x-real-ip"]
  }
  return out
}

/** Extract table names referenced in a SQL query (simple heuristic). */
function extractTables(sql: string): string[] {
  const tables = new Set<string>()
  // Match FROM/JOIN table references (handles aliases like "FROM table t" and "JOIN table ON")
  const pattern = /(?:FROM|JOIN)\s+([a-z][a-z0-9_]*)/gi
  let match
  while ((match = pattern.exec(sql)) !== null) {
    const name = match[1].toLowerCase()
    // Skip SQL keywords that can follow FROM/JOIN
    if (name !== "select" && name !== "lateral" && name !== "unnest") {
      tables.add(name)
    }
  }
  return [...tables].sort()
}

export function logMcp(
  tool: string,
  params: Record<string, unknown>,
  durationMs: number,
  opts?: { resultChars?: number; error?: string },
): void {
  const entry: McpLogEntry = {
    type: "mcp",
    ts: new Date().toISOString(),
    tool,
    params: sanitizeParams(params),
    durationMs,
    ...opts,
  }
  emit(entry)
}

export function logRest(method: string, path: string, status: number, durationMs: number): void {
  emit({ type: "rest", ts: new Date().toISOString(), method, path, status, durationMs })
}

export function logSql(
  via: "rest" | "mcp",
  network: string,
  sql: string,
  durationMs: number,
  opts?: { rowCount?: number; error?: string },
): void {
  const entry: SqlLogEntry = {
    type: "sql",
    ts: new Date().toISOString(),
    via,
    network,
    sql: sql.length > 2000 ? sql.slice(0, 2000) + "..." : sql,
    durationMs,
    tables: extractTables(sql),
    ...opts,
  }
  if (durationMs >= SLOW_QUERY_MS) entry.slow = true
  emit(entry)
}

export function logStartup(port: number, networks: string[], betterstack: boolean): void {
  emit({ type: "startup", ts: new Date().toISOString(), port, networks, betterstack })
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry)
  process.stdout.write(line + "\n")

  if (LOG_PATH) {
    if (!logReady) logReady = ensureLogDir()
    logReady.then(() => appendFile(LOG_PATH, line + "\n").catch(() => {}))
  }
}
