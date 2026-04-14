/**
 * Client for the DealBot REST API.
 * DealBot is the FOC quality assurance system that continuously tests storage
 * providers by running deals, retrievals, and data retention checks.
 *
 * Mainnet: https://dealbot.filoz.org/api
 * Calibnet (staging): https://staging.dealbot.filoz.org/api
 */

import type { NetworkName } from "./networks.js"

const DEALBOT_URLS: Record<NetworkName, string> = {
  mainnet: "https://dealbot.filoz.org/api",
  calibnet: "https://staging.dealbot.filoz.org/api",
}

// DealBot responses are complex nested objects. We pass them through as-is
// with a network tag. The system context teaches the agent what fields mean.
interface Tagged { network: NetworkName; [key: string]: unknown }

export class DealbotClient {
  private getUrl(network: NetworkName): string {
    return DEALBOT_URLS[network]
  }

  private async get(network: NetworkName, path: string): Promise<Tagged> {
    const url = `${this.getUrl(network)}${path}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`DealBot API error (${response.status}): ${await response.text()}`)
    }
    const data = await response.json() as Record<string, unknown>
    return { network, ...data }
  }

  /** Network-wide aggregate stats. */
  async getNetworkStats(network: NetworkName): Promise<Tagged> {
    return this.get(network, "/v1/metrics/network/stats")
  }

  /** All providers with performance metrics. Endpoint removed from DealBot API; throws descriptive error. */
  async getProviderMetrics(_network: NetworkName): Promise<Tagged> {
    throw new Error("DealBot /v1/providers/metrics endpoint has been removed. Use BetterStack-backed get_dealbot_providers MCP tool instead, or query individual providers via get_dealbot_provider_detail.")
  }

  /** Single provider metrics over a time window. Presets: 1h, 6h, 12h, 24h, 7d, 30d, 90d. */
  async getProviderWindow(network: NetworkName, spAddress: string, preset: string = "7d"): Promise<Tagged> {
    return this.get(network, `/v1/providers/metrics/${spAddress}/window?preset=${preset}`)
  }

  /** Daily metrics for trend analysis. */
  async getDailyMetrics(network: NetworkName, days: number = 7): Promise<Tagged> {
    return this.get(network, `/v1/metrics/daily/recent?days=${days}`)
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
