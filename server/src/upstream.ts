import { logBackendError } from "./logger.js"
import { PublicError, ServiceUnavailableError } from "./public-error.js"

export const UPSTREAM_TIMEOUT_MS = 10_000
export const MAX_UPSTREAM_RESPONSE_BYTES = 1_048_576
export const MAX_CACHE_ENTRIES = 128
export const MAX_INFLIGHT_REQUESTS = 32

interface CacheEntry<T> {
  value: T
  expiry: number
}

export class BoundedCache<T> {
  private entries = new Map<string, CacheEntry<T>>()
  private readonly maxEntries: number

  constructor(maxEntries = MAX_CACHE_ENTRIES) {
    this.maxEntries = maxEntries
  }
  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiry) {
      this.entries.delete(key)
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, ttl: number): void {
    this.entries.delete(key)
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    this.entries.set(key, { value, expiry: Date.now() + ttl })
  }
}

export class RequestCoalescer {
  private requests = new Map<string, Promise<unknown>>()
  private readonly maxRequests: number

  constructor(maxRequests = MAX_INFLIGHT_REQUESTS) {
    this.maxRequests = maxRequests
  }
  run<T>(key: string, request: () => Promise<T>): Promise<T> {
    const existing = this.requests.get(key)
    if (existing) return existing as Promise<T>
    if (this.requests.size >= this.maxRequests) {
      return Promise.reject(new ServiceUnavailableError("Upstream request capacity exceeded."))
    }

    const pending = request().finally(() => this.requests.delete(key))
    this.requests.set(key, pending)
    return pending
  }
}

async function readBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return ""

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let complete = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        complete = true
        break
      }
      size += value.byteLength
      if (size > maxBytes) {
        throw new PublicError("Upstream response exceeds the configured size limit.")
      }
      chunks.push(value)
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

export async function fetchText(url: string, init: RequestInit = {}, maxBytes = MAX_UPSTREAM_RESPONSE_BYTES): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetch(url, { ...init, signal: controller.signal })
    } catch (error) {
      logBackendError("upstream", "fetch", error)
      if (controller.signal.aborted) throw new PublicError("Upstream request timed out.")
      throw new PublicError("Upstream request failed.")
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      logBackendError("upstream", "response", { status: response.status })
      throw new PublicError("Upstream request failed.")
    }

    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel()
      throw new PublicError("Upstream response exceeds the configured size limit.")
    }

    try {
      return await readBody(response, maxBytes)
    } catch (error) {
      if (!(error instanceof PublicError)) logBackendError("upstream", "read", error)
      if (controller.signal.aborted) throw new PublicError("Upstream request timed out.")
      if (error instanceof PublicError) throw error
      throw new PublicError("Upstream request failed.")
    }
  } finally {
    clearTimeout(timeout)
  }
}
