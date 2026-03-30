/**
 * Structured JSON logger for foc-observer.
 *
 * Writes JSON lines to stdout and optionally to a persistent log file.
 * Every entry has a type field for filtering:
 *   mcp  -- MCP tool calls (tool name, params, duration, result size)
 *   rest -- HTTP REST requests (method, path, status, duration)
 *   sql  -- SQL queries via REST (network, query, rows, duration)
 *
 * Analysis examples:
 *   jq 'select(.type=="mcp")' < foc-observer.jsonl
 *   jq 'select(.type=="mcp") | {tool, durationMs}' < foc-observer.jsonl | sort
 *   jq 'select(.type=="mcp") | .tool' < foc-observer.jsonl | sort | uniq -c | sort -rn
 *   jq 'select(.type=="mcp" and .tool=="query_sql") | .params.sql' < foc-observer.jsonl
 */

import { appendFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const LOG_PATH = process.env.FOC_LOG_PATH || ""

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
  rowCount?: number
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

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (k === "i_have_read_the_system_context") continue
    if (k === "sql" && typeof v === "string") {
      out[k] = v.length > 1000 ? v.slice(0, 1000) + "..." : v
    } else {
      out[k] = v
    }
  }
  return out
}

export function logMcp(
  tool: string,
  params: Record<string, unknown>,
  durationMs: number,
  opts?: { resultChars?: number; rowCount?: number; error?: string },
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
  emit({
    type: "sql",
    ts: new Date().toISOString(),
    via,
    network,
    sql: sql.length > 2000 ? sql.slice(0, 2000) + "..." : sql,
    durationMs,
    ...opts,
  })
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
