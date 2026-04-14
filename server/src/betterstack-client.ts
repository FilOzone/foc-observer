/**
 * BetterStack ClickHouse client for querying DealBot Prometheus metrics.
 *
 * Queries pre-aggregated Prometheus counter data stored in BetterStack's
 * ClickHouse instance. Replaces the DealBot REST API as primary data
 * source for quality metrics (deals, retrievals, data retention).
 *
 * Credentials: BETTERSTACK_CH_USER / BETTERSTACK_CH_PASSWORD env vars.
 * Tables: remote(t468215_infra_staging_2_metrics) calibnet,
 *         remote(t468215_infra_prod_metrics) mainnet.
 */

import type { NetworkName } from "./networks.js"

const ENDPOINT = "https://us-east-9-connect.betterstackdata.com"

const TABLES: Record<NetworkName, string> = {
  calibnet: "remote(t468215_infra_staging_2_metrics)",
  mainnet: "remote(t468215_infra_prod_metrics)",
}

const QUANTIZED_HOURS = [1, 6, 12, 24, 72, 168, 720, 2160] as const
type QuantizedHours = (typeof QUANTIZED_HOURS)[number]

const CACHE_TTL: Record<QuantizedHours, number> = {
  1: 5 * 60_000,
  6: 5 * 60_000,
  12: 15 * 60_000,
  24: 15 * 60_000,
  72: 15 * 60_000,
  168: 60 * 60_000,
  720: 60 * 60_000,
  2160: 60 * 60_000,
}

const VALID_BUCKETS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
}

function quantizeHours(hours: number): QuantizedHours {
  if (!Number.isFinite(hours) || hours <= 0) return 72 // safe default
  for (const tier of QUANTIZED_HOURS) {
    if (hours <= tier) return tier
  }
  return 2160
}

export function parseBucket(bucket: string): number {
  const hours = VALID_BUCKETS[bucket]
  if (!hours) throw new Error(`Invalid bucket "${bucket}". Must be one of: ${Object.keys(VALID_BUCKETS).join(", ")}`)
  return hours
}

export interface ProviderMetrics {
  providerId: string
  providerName: string
  providerStatus: string
  totalDeals: number
  dealSuccesses: number
  dealFailures: number
  dealSuccessRate: number
  totalIpfsRetrievals: number
  ipfsRetrievalSuccesses: number
  ipfsRetrievalFailures: number
  ipfsRetrievalSuccessRate: number
}

export interface NetworkMetrics {
  network: NetworkName
  hours: number
  totalProviders: number
  approvedProviders: number
  totalDeals: number
  dealSuccessRate: number
  totalIpfsRetrievals: number
  ipfsRetrievalSuccessRate: number
}

export interface TimeSeriesBucket {
  bucket: string
  providerId: string
  providerName: string
  totalDeals: number
  dealSuccesses: number
  dealSuccessRate: number
  totalIpfsRetrievals: number
  ipfsRetrievalSuccesses: number
  ipfsRetrievalSuccessRate: number
}

interface CacheEntry {
  data: unknown
  expiry: number
}

interface RawRow {
  provider_id?: string
  provider_name?: string
  provider_status?: string
  name?: string
  status_label?: string
  delta?: number
  bucket?: string
}

export class BetterStackClient {
  private username: string
  private password: string
  private cache = new Map<string, CacheEntry>()

  constructor(username: string, password: string) {
    this.username = username
    this.password = password
  }

  isConfigured(): boolean {
    return Boolean(this.username && this.password)
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiry) {
      this.cache.delete(key)
      return undefined
    }
    return entry.data as T
  }

  private setCache(key: string, data: unknown, hours: QuantizedHours): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + CACHE_TTL[hours],
    })
  }

  private async query(network: NetworkName, sql: string): Promise<RawRow[]> {
    const table = TABLES[network]
    const fullSql = sql.replace(/\{table\}/g, table) + " FORMAT JSONEachRow"

    const auth = Buffer.from(`${this.username}:${this.password}`).toString("base64")
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `Basic ${auth}`,
      },
      body: fullSql,
    })

    if (!response.ok) {
      const text = await response.text()
      // Strip credentials from any error messages
      const sanitized = text
        .replace(new RegExp(this.username, "g"), "***")
        .replace(new RegExp(this.password, "g"), "***")
        .replace(/[A-Za-z0-9+/=]{20,}/g, "***")
      throw new Error(`BetterStack query failed (${response.status}): ${sanitized.slice(0, 200)}`)
    }

    const text = await response.text()
    if (!text.trim()) return []

    return text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as RawRow)
  }

  private static validateProviderId(providerId: string): string {
    if (!/^\d+$/.test(providerId)) {
      throw new Error(`Invalid provider ID "${providerId}". Must be a numeric string.`)
    }
    return providerId
  }

  private buildAggregateQuery(hours: QuantizedHours, providerId?: string): string {
    const providerFilter = providerId
      ? `AND tags['providerId'] = '${BetterStackClient.validateProviderId(providerId)}'`
      : ""

    // Compute delta per series_id first, then sum across series.
    // This handles Prometheus counter resets from pod restarts correctly.
    return `SELECT
  provider_id, provider_name, provider_status, name, status_label,
  sum(delta) AS delta
FROM (
  SELECT
    series_id,
    tags['providerId'] AS provider_id,
    tags['providerName'] AS provider_name,
    tags['providerStatus'] AS provider_status,
    name,
    tags['value'] AS status_label,
    greatest(0, maxMerge(value_max) - minMerge(value_min)) AS delta
  FROM {table}
  WHERE dt >= now() - INTERVAL ${hours} HOUR
    AND name IN ('dataStorageStatus', 'retrievalStatus')
    AND tags['app'] = 'dealbot'
    ${providerFilter}
  GROUP BY series_id, provider_id, provider_name, provider_status, name, status_label
)
GROUP BY provider_id, provider_name, provider_status, name, status_label
HAVING delta > 0
ORDER BY provider_id, name, status_label`
  }

  private buildTimeSeriesQuery(hours: QuantizedHours, bucketHours: number, providerId?: string): string {
    const providerFilter = providerId
      ? `AND tags['providerId'] = '${BetterStackClient.validateProviderId(providerId)}'`
      : ""

    return `SELECT
  bucket, provider_id, provider_name, name, status_label,
  sum(delta) AS delta
FROM (
  SELECT
    series_id,
    toString(toStartOfInterval(dt, INTERVAL ${bucketHours} HOUR)) AS bucket,
    tags['providerId'] AS provider_id,
    tags['providerName'] AS provider_name,
    name,
    tags['value'] AS status_label,
    greatest(0, maxMerge(value_max) - minMerge(value_min)) AS delta
  FROM {table}
  WHERE dt >= now() - INTERVAL ${hours} HOUR
    AND name IN ('dataStorageStatus', 'retrievalStatus')
    AND tags['app'] = 'dealbot'
    ${providerFilter}
  GROUP BY series_id, bucket, provider_id, provider_name, name, status_label
)
GROUP BY bucket, provider_id, provider_name, name, status_label
HAVING delta > 0
ORDER BY bucket, provider_id, name, status_label`
  }

  private transformToProviderMetrics(rows: RawRow[]): ProviderMetrics[] {
    const providers = new Map<string, ProviderMetrics>()

    for (const row of rows) {
      const id = row.provider_id ?? ""
      if (!providers.has(id)) {
        providers.set(id, {
          providerId: id,
          providerName: row.provider_name ?? "",
          providerStatus: row.provider_status ?? "",
          totalDeals: 0, dealSuccesses: 0, dealFailures: 0, dealSuccessRate: 0,
          totalIpfsRetrievals: 0, ipfsRetrievalSuccesses: 0, ipfsRetrievalFailures: 0, ipfsRetrievalSuccessRate: 0,
        })
      }
      const p = providers.get(id)!
      const delta = Math.round(row.delta ?? 0)
      const isSuccess = row.status_label === "success"
      const isFailure = row.status_label?.startsWith("failure") ?? false

      if (row.name === "dataStorageStatus") {
        if (isSuccess) p.dealSuccesses += delta
        if (isFailure) p.dealFailures += delta
        if (isSuccess || isFailure) p.totalDeals += delta
      } else if (row.name === "retrievalStatus") {
        if (isSuccess) p.ipfsRetrievalSuccesses += delta
        if (isFailure) p.ipfsRetrievalFailures += delta
        if (isSuccess || isFailure) p.totalIpfsRetrievals += delta
      }
    }

    for (const p of providers.values()) {
      p.dealSuccessRate = p.totalDeals > 0 ? Math.round((p.dealSuccesses / p.totalDeals) * 10000) / 100 : 0
      p.ipfsRetrievalSuccessRate = p.totalIpfsRetrievals > 0 ? Math.round((p.ipfsRetrievalSuccesses / p.totalIpfsRetrievals) * 10000) / 100 : 0
    }

    return [...providers.values()].sort((a, b) => Number(a.providerId) - Number(b.providerId))
  }

  private transformToTimeSeries(rows: RawRow[]): TimeSeriesBucket[] {
    const key = (bucket: string, pid: string) => `${bucket}:${pid}`
    const buckets = new Map<string, TimeSeriesBucket>()

    for (const row of rows) {
      const k = key(row.bucket ?? "", row.provider_id ?? "")
      if (!buckets.has(k)) {
        buckets.set(k, {
          bucket: row.bucket ?? "",
          providerId: row.provider_id ?? "",
          providerName: row.provider_name ?? "",
          totalDeals: 0, dealSuccesses: 0, dealSuccessRate: 0,
          totalIpfsRetrievals: 0, ipfsRetrievalSuccesses: 0, ipfsRetrievalSuccessRate: 0,
        })
      }
      const b = buckets.get(k)!
      const delta = Math.round(row.delta ?? 0)
      const isSuccess = row.status_label === "success"
      const isFailure = row.status_label?.startsWith("failure") ?? false

      if (row.name === "dataStorageStatus") {
        if (isSuccess) b.dealSuccesses += delta
        if (isSuccess || isFailure) b.totalDeals += delta
      } else if (row.name === "retrievalStatus") {
        if (isSuccess) b.ipfsRetrievalSuccesses += delta
        if (isSuccess || isFailure) b.totalIpfsRetrievals += delta
      }
    }

    for (const b of buckets.values()) {
      b.dealSuccessRate = b.totalDeals > 0 ? Math.round((b.dealSuccesses / b.totalDeals) * 10000) / 100 : 0
      b.ipfsRetrievalSuccessRate = b.totalIpfsRetrievals > 0 ? Math.round((b.ipfsRetrievalSuccesses / b.totalIpfsRetrievals) * 10000) / 100 : 0
    }

    return [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket) || Number(a.providerId) - Number(b.providerId))
  }

  async getProviderMetrics(network: NetworkName, hours: number): Promise<ProviderMetrics[]> {
    const qh = quantizeHours(hours)
    const cacheKey = `${network}:providers:${qh}`

    const cached = this.getCached<ProviderMetrics[]>(cacheKey)
    if (cached) return cached

    const sql = this.buildAggregateQuery(qh)
    const rows = await this.query(network, sql)
    const result = this.transformToProviderMetrics(rows)

    this.setCache(cacheKey, result, qh)
    return result
  }

  async getProviderDetail(network: NetworkName, providerId: string, hours: number): Promise<ProviderMetrics | null> {
    const qh = quantizeHours(hours)
    const cacheKey = `${network}:provider:${providerId}:${qh}`

    const cached = this.getCached<ProviderMetrics | null>(cacheKey)
    if (cached !== undefined) return cached

    const sql = this.buildAggregateQuery(qh, providerId)
    const rows = await this.query(network, sql)
    const providers = this.transformToProviderMetrics(rows)
    const result = providers.length > 0 ? providers[0] : null

    this.setCache(cacheKey, result, qh)
    return result
  }

  async getNetworkStats(network: NetworkName, hours: number): Promise<NetworkMetrics> {
    const providers = await this.getProviderMetrics(network, hours)

    const approvedStatuses = new Set(["approved", "endorsed"])
    const approved = providers.filter((p) => approvedStatuses.has(p.providerStatus))

    const totalDeals = providers.reduce((s, p) => s + p.totalDeals, 0)
    const dealSuccesses = providers.reduce((s, p) => s + p.dealSuccesses, 0)
    const totalRetrievals = providers.reduce((s, p) => s + p.totalIpfsRetrievals, 0)
    const retrievalSuccesses = providers.reduce((s, p) => s + p.ipfsRetrievalSuccesses, 0)

    return {
      network,
      hours: quantizeHours(hours),
      totalProviders: providers.length,
      approvedProviders: approved.length,
      totalDeals,
      dealSuccessRate: totalDeals > 0 ? Math.round((dealSuccesses / totalDeals) * 10000) / 100 : 0,
      totalIpfsRetrievals: totalRetrievals,
      ipfsRetrievalSuccessRate: totalRetrievals > 0 ? Math.round((retrievalSuccesses / totalRetrievals) * 10000) / 100 : 0,
    }
  }

  async getTimeSeries(network: NetworkName, hours: number, bucketHours: number): Promise<TimeSeriesBucket[]> {
    const qh = quantizeHours(hours)
    const cacheKey = `${network}:timeseries:${qh}:${bucketHours}`

    const cached = this.getCached<TimeSeriesBucket[]>(cacheKey)
    if (cached) return cached

    const sql = this.buildTimeSeriesQuery(qh, bucketHours)
    const rows = await this.query(network, sql)
    const result = this.transformToTimeSeries(rows)

    this.setCache(cacheKey, result, qh)
    return result
  }
}
