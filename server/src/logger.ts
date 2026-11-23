import { InputError } from "./inputs.js"
import type { SqlSizeMetrics } from "./ponder-client.js"
import { PublicError } from "./public-error.js"

/**
 * Structured JSON logger for foc-observer.
 *
 * JSON lines on stdout. Compose controls rotation and retention.
 */

const SLOW_QUERY_MS = 500

export interface McpLogEntry {
  type: "mcp"
  ts: string
  tool: string
  durationMs: number
  resultChars?: number
  error?: "input" | "backend"
}

export interface RestLogEntry {
  type: "rest"
  ts: string
  method: string
  operation: string
  status: number
  durationMs: number
}

export interface SqlLogEntry extends SqlSizeMetrics {
  type: "sql"
  ts: string
  via: "rest" | "mcp"
  network: string
  sql?: string
  durationMs: number
  rowCount?: number
  tables?: string[]
  slow?: boolean
  error?: "input" | "backend"
}

export interface StartupLogEntry {
  type: "startup"
  ts: string
  port: number
  networks: string[]
  betterstack: boolean
}

export interface BackendLogEntry {
  type: "backend"
  ts: string
  component: string
  operation: string
  network?: string
  category: "database" | "network" | "rpc" | "upstream" | "unknown"
  cause: "authentication" | "connection" | "response" | "timeout" | "upstream" | "unknown"
  code?: string | number
}

type LogEntry = McpLogEntry | RestLogEntry | SqlLogEntry | StartupLogEntry | BackendLogEntry

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
  durationMs: number,
  opts?: { resultChars?: number; error?: "input" | "backend" },
): void {
  const entry: McpLogEntry = {
    type: "mcp",
    ts: new Date().toISOString(),
    tool,
    durationMs,
    ...opts,
  }
  emit(entry)
}

export function logRest(method: string, routePath: string, status: number, durationMs: number): void {
  const operation = /^(?:\/(?:[a-z_]+|:[a-z_]+))*\/?$/.test(routePath) ? routePath : "request"
  emit({ type: "rest", ts: new Date().toISOString(), method, operation, status, durationMs })
}

export function logSql(
  via: "rest" | "mcp",
  network: string,
  sql: string,
  durationMs: number,
  opts?: SqlSizeMetrics & { rowCount?: number; error?: "input" | "backend" },
): void {
  const failed = opts?.error !== undefined
  const entry: SqlLogEntry = {
    type: "sql",
    ts: new Date().toISOString(),
    via,
    network,
    ...(failed ? {} : { sql: sql.length > 2_000 ? `${sql.slice(0, 2_000)}...` : sql }),
    durationMs,
    tables: extractTables(sql.slice(0, 2_000)),
    ...opts,
  }
  if (durationMs >= SLOW_QUERY_MS) entry.slow = true
  emit(entry)
}

const NETWORK_CODES: Record<string, true> = {
  ECONNABORTED: true,
  ECONNREFUSED: true,
  ECONNRESET: true,
  EHOSTUNREACH: true,
  ENETUNREACH: true,
  ENOTFOUND: true,
  EPIPE: true,
  ETIMEDOUT: true,
  UND_ERR_CONNECT_TIMEOUT: true,
  UND_ERR_HEADERS_TIMEOUT: true,
  UND_ERR_SOCKET: true,
}
const RPC_ERROR_NAMES: Record<string, true> = {
  CallExecutionError: true,
  ContractFunctionExecutionError: true,
  HttpRequestError: true,
  RpcRequestError: true,
}

function boundedLabel(value: string): string {
  return /^[a-z][a-z0-9_.:-]{0,63}$/.test(value) ? value : "unknown"
}

function failureDetails(error: unknown): Omit<BackendLogEntry, "type" | "ts" | "component" | "operation" | "network"> {
  let current = error
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
    const value = current as { code?: unknown; name?: unknown; cause?: unknown; status?: unknown }
    if (typeof value.code === "string") {
      if (Object.hasOwn(NETWORK_CODES, value.code)) {
        return { category: "network", cause: "connection", code: value.code }
      }
      if (/^[0-9A-Z]{5}$/.test(value.code)) {
        return { category: "database", cause: "upstream", code: value.code }
      }
    }
    if (typeof value.code === "number" && Number.isInteger(value.code) && value.code >= -99_999 && value.code <= 99_999) {
      return { category: "rpc", cause: "upstream", code: value.code }
    }
    if (value.name === "AbortError") return { category: "network", cause: "timeout" }
    if (typeof value.name === "string" && Object.hasOwn(RPC_ERROR_NAMES, value.name)) {
      return { category: "rpc", cause: "upstream" }
    }
    if (typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599) {
      return {
        category: "upstream",
        cause: value.status === 401 || value.status === 403 ? "authentication" : "response",
        code: value.status,
      }
    }
    current = value.cause
  }
  return { category: "unknown", cause: "unknown" }
}

/** Log bounded failure metadata without retaining backend diagnostics or request content. */
export function logBackendError(component: string, operation: string, error: unknown, network?: string): void {
  if (error instanceof InputError) return
  const cause = error instanceof PublicError ? error.cause : error
  if (cause === undefined) return
  emit({
    type: "backend",
    ts: new Date().toISOString(),
    component: boundedLabel(component),
    operation: boundedLabel(operation),
    ...(network === undefined ? {} : { network: boundedLabel(network) }),
    ...failureDetails(cause),
  })
}

export function logStartup(port: number, networks: string[], betterstack: boolean): void {
  emit({ type: "startup", ts: new Date().toISOString(), port, networks, betterstack })
}

function emit(entry: LogEntry): void {
  // Drop telemetry instead of queueing requests' logs behind a stalled sink.
  if (!process.stdout.writableNeedDrain) process.stdout.write(JSON.stringify(entry) + "\n")
}
