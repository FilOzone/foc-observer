/**
 * Client for the DealBot REST API.
 * DealBot is the FOC quality assurance system that continuously tests storage
 * providers by running deals, retrievals, and data retention checks.
 *
 * Mainnet: https://dealbot.filoz.org/api
 * Calibnet (staging): https://staging.dealbot.filoz.org/api
 */

import { InputError } from "./inputs.js"
import { PublicError } from "./public-error.js"
import { BoundedCache, fetchText, RequestCoalescer } from "./upstream.js"
import type { NetworkName } from "./networks.js"

const DEALBOT_URLS: Record<NetworkName, string> = {
  mainnet: "https://dealbot.filoz.org/api",
  calibnet: "https://staging.dealbot.filoz.org/api",
}

// Provider reference in a DealBot path segment: an address or ID, never a
// separator or dot segment.
const PROVIDER_REF_RE = /^[0-9A-Za-z]{1,128}$/

const WINDOW_PRESETS = new Set(["1h", "6h", "12h", "24h", "7d", "30d", "90d"])

// DealBot responses are complex nested objects. We pass them through as-is
// with a network tag. The system context teaches the agent what fields mean.
interface Tagged { network: NetworkName; [key: string]: unknown }

const CACHE_TTL = 60_000

export class DealbotClient {
  private readonly cache = new BoundedCache<Tagged>()
  private readonly requests = new RequestCoalescer()

  private getUrl(network: NetworkName): string {
    return DEALBOT_URLS[network]
  }

  private async get(network: NetworkName, path: string): Promise<Tagged> {
    const cacheKey = `${network}:${path}`
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined) return cached

    return this.requests.run(cacheKey, async () => {
      const text = await fetchText(`${this.getUrl(network)}${path}`)
      let value: unknown
      try {
        value = JSON.parse(text)
      } catch {
        throw new PublicError("DealBot returned an invalid response.")
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new PublicError("DealBot returned an invalid response.")
      }
      const data = value as Record<string, unknown>
      const result = { ...data, network }
      this.cache.set(cacheKey, result, CACHE_TTL)
      return result
    })
  }

  /** Network-wide aggregate stats. */
  async getNetworkStats(network: NetworkName): Promise<Tagged> {
    return this.get(network, "/v1/metrics/network/stats")
  }

  /** All providers with performance metrics. Endpoint removed from DealBot API. */
  async getProviderMetrics(_network: NetworkName): Promise<Tagged> {
    throw new PublicError("DealBot provider metrics are unavailable. Use the BetterStack-backed provider tools instead.")
  }

  /** Single provider metrics over a time window. Presets: 1h, 6h, 12h, 24h, 7d, 30d, 90d. */
  async getProviderWindow(network: NetworkName, spAddress: string, preset: string = "7d"): Promise<Tagged> {
    if (!PROVIDER_REF_RE.test(spAddress)) {
      throw new InputError("Invalid provider: expected an address or ID.")
    }
    if (!WINDOW_PRESETS.has(preset)) {
      throw new InputError(`Invalid preset: expected one of ${[...WINDOW_PRESETS].join(", ")}.`)
    }
    return this.get(network, `/v1/providers/metrics/${spAddress}/window?preset=${preset}`)
  }

  /** Daily metrics for trend analysis. */
  async getDailyMetrics(network: NetworkName, days: number = 7): Promise<Tagged> {
    if (!Number.isInteger(days) || days < 1) {
      throw new InputError("Invalid days: expected a positive integer.")
    }
    return this.get(network, `/v1/metrics/daily/recent?${new URLSearchParams({ days: String(days) })}`)
  }

  /** Deal failure summary. */
  async getFailedDealsSummary(network: NetworkName): Promise<Tagged> {
    return this.get(network, "/v1/metrics/failed-deals/summary")
  }

  /** Retrieval failure summary. */
  async getFailedRetrievalsSummary(network: NetworkName): Promise<Tagged> {
    return this.get(network, "/v1/metrics/failed-retrievals/summary")
  }
}
