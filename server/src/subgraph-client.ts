/**
 * GraphQL client for the PDP Explorer subgraph (Goldsky).
 *
 * Independent cross-check for proving health computed from indexed PDP events.
 * Unlike FWSS fault records, the subgraph includes periods when a provider
 * missed its deadline without emitting an event.
 *
 * Public, unauthenticated GraphQL. No credentials needed.
 */

import { parseAddress, parseUint256, parseWeeks } from "./inputs.js"
import { PublicError } from "./public-error.js"
import { BoundedCache, fetchText, RequestCoalescer } from "./upstream.js"
import type { NetworkName, NetworkConfig } from "./networks.js"

// Cache TTLs
const PROVIDER_CACHE_TTL = 5 * 60_000    // 5 minutes
const WEEKLY_CACHE_TTL = 15 * 60_000     // 15 minutes
const DATASET_CACHE_TTL = 5 * 60_000     // 5 minutes

export interface SubgraphProvider {
  address: string
  totalFaultedPeriods: number
  totalProvingPeriods: number
  totalFaultedRoots: number
  totalProofSets: number
  totalRoots: number
  totalDataSize: string
  faultRate: number
}

export interface WeeklyActivity {
  id: string
  totalFaultedPeriods: number
  totalProofs: number
  totalFaultedRoots: number
  totalRootsProved: number
  totalRootsAdded: number
  totalRootsRemoved: number
  totalDataSizeAdded: string
  totalDataSizeRemoved: string
  totalProofSetsCreated: number
}

export interface SubgraphDataSet {
  setId: string
  isActive: boolean
  provenThisPeriod: boolean
  nextDeadline: string
  lastProvenEpoch: string
  currentDeadlineCount: number
  totalFaultedPeriods: number
  totalProofs: number
  totalRoots: number
  totalDataSize: string
  leafCount: number
}

export interface ProviderProvingHealth {
  provider: SubgraphProvider
  weeklyActivity: WeeklyActivity[]
  datasets: SubgraphDataSet[]
}


interface GraphQLResponse {
  data?: Record<string, unknown>
  errors?: Array<{ message: string }>
}

export class SubgraphClient {
  private urls: Record<NetworkName, string>
  private readonly cache = new BoundedCache<unknown>()
  private readonly requests = new RequestCoalescer()

  constructor(configs: Map<NetworkName, NetworkConfig>) {
    this.urls = {} as Record<NetworkName, string>
    for (const [name, config] of configs) {
      this.urls[name] = config.subgraphUrl
    }
  }

  private getCached<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined
  }

  private setCache(key: string, data: unknown, ttl: number): void {
    this.cache.set(key, data, ttl)
  }

  private async query(network: NetworkName, gql: string): Promise<Record<string, unknown>> {
    const url = this.urls[network]
    if (!url) throw new PublicError("Subgraph is not configured for this network.")
    const text = await fetchText(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: gql }),
    })

    let result: GraphQLResponse
    try {
      result = JSON.parse(text) as GraphQLResponse
    } catch {
      throw new PublicError("Subgraph returned an invalid response.")
    }
    if (result.errors?.length) throw new PublicError("Subgraph returned an error.")
    if (!result.data) throw new PublicError("Subgraph returned no data.")
    return result.data
  }

  async getProviders(network: NetworkName): Promise<SubgraphProvider[]> {
    const cacheKey = `${network}:providers`
    const cached = this.getCached<SubgraphProvider[]>(cacheKey)
    if (cached !== undefined) return cached

    return this.requests.run(cacheKey, async () => {
      const data = await this.query(network, `{
        providers(first: 100) {
          id address
          totalFaultedPeriods totalProvingPeriods
          totalFaultedRoots totalProofSets totalRoots totalDataSize
        }
      }`)
      const raw = data.providers as Array<Record<string, string>>
      const result: SubgraphProvider[] = raw.map((p) => {
        const faulted = Number(p.totalFaultedPeriods)
        const total = Number(p.totalProvingPeriods)
        return {
          address: p.address ?? p.id,
          totalFaultedPeriods: faulted,
          totalProvingPeriods: total,
          totalFaultedRoots: Number(p.totalFaultedRoots),
          totalProofSets: Number(p.totalProofSets),
          totalRoots: Number(p.totalRoots),
          totalDataSize: p.totalDataSize,
          faultRate: total > 0 ? Math.round((faulted / total) * 10000) / 100 : 0,
        }
      })
      this.setCache(cacheKey, result, PROVIDER_CACHE_TTL)
      return result
    })
  }

  async getProvider(network: NetworkName, address: string): Promise<SubgraphProvider | null> {
    const addr = parseAddress(address)
    const cacheKey = `${network}:provider:${addr}`
    const cached = this.getCached<SubgraphProvider>(cacheKey)
    if (cached !== undefined) return cached

    return this.requests.run(cacheKey, async () => {
      const data = await this.query(network, `{
        provider(id: "${addr}") {
          id address
          totalFaultedPeriods totalProvingPeriods
          totalFaultedRoots totalProofSets totalRoots totalDataSize
        }
      }`)
      const p = data.provider as Record<string, string> | null
      if (!p) return null

      const faulted = Number(p.totalFaultedPeriods)
      const total = Number(p.totalProvingPeriods)
      const result: SubgraphProvider = {
        address: p.address ?? p.id,
        totalFaultedPeriods: faulted,
        totalProvingPeriods: total,
        totalFaultedRoots: Number(p.totalFaultedRoots),
        totalProofSets: Number(p.totalProofSets),
        totalRoots: Number(p.totalRoots),
        totalDataSize: p.totalDataSize,
        faultRate: total > 0 ? Math.round((faulted / total) * 10000) / 100 : 0,
      }
      this.setCache(cacheKey, result, PROVIDER_CACHE_TTL)
      return result
    })
  }

  async getProviderWeekly(network: NetworkName, address: string, weeks: number = 4): Promise<WeeklyActivity[]> {
    const addr = parseAddress(address)
    const weekCount = parseWeeks(weeks)
    const cacheKey = `${network}:weekly:${addr}:${weekCount}`
    const cached = this.getCached<WeeklyActivity[]>(cacheKey)
    if (cached !== undefined) return cached

    return this.requests.run(cacheKey, async () => {
      const data = await this.query(network, `{
        weeklyProviderActivities(
          first: ${weekCount}
          orderBy: id
          orderDirection: desc
          where: { providerId: "${addr}" }
        ) {
          id
          totalFaultedPeriods totalProofs
          totalFaultedRoots totalRootsProved
          totalRootsAdded totalRootsRemoved
          totalDataSizeAdded totalDataSizeRemoved
          totalProofSetsCreated
        }
      }`)
      const raw = data.weeklyProviderActivities as Array<Record<string, string>>
      const result: WeeklyActivity[] = raw.map((w) => ({
        id: w.id,
        totalFaultedPeriods: Number(w.totalFaultedPeriods),
        totalProofs: Number(w.totalProofs),
        totalFaultedRoots: Number(w.totalFaultedRoots),
        totalRootsProved: Number(w.totalRootsProved),
        totalRootsAdded: Number(w.totalRootsAdded),
        totalRootsRemoved: Number(w.totalRootsRemoved),
        totalDataSizeAdded: w.totalDataSizeAdded,
        totalDataSizeRemoved: w.totalDataSizeRemoved,
        totalProofSetsCreated: Number(w.totalProofSetsCreated),
      }))
      if (result.length) this.setCache(cacheKey, result, WEEKLY_CACHE_TTL)
      return result
    })
  }

  async getProviderDatasets(network: NetworkName, address: string): Promise<SubgraphDataSet[]> {
    const addr = parseAddress(address)
    const cacheKey = `${network}:datasets:${addr}`
    const cached = this.getCached<SubgraphDataSet[]>(cacheKey)
    if (cached !== undefined) return cached

    return this.requests.run(cacheKey, async () => {
      const data = await this.query(network, `{
        dataSets(
          first: 100
          where: { owner: "${addr}" }
          orderBy: setId
          orderDirection: desc
        ) {
          setId isActive provenThisPeriod nextDeadline lastProvenEpoch
          currentDeadlineCount totalFaultedPeriods totalProofs
          totalRoots totalDataSize leafCount
        }
      }`)
      const raw = data.dataSets as Array<Record<string, string | boolean>>
      const result: SubgraphDataSet[] = raw.map((d) => ({
        setId: String(d.setId),
        isActive: Boolean(d.isActive),
        provenThisPeriod: Boolean(d.provenThisPeriod),
        nextDeadline: String(d.nextDeadline),
        lastProvenEpoch: String(d.lastProvenEpoch),
        currentDeadlineCount: Number(d.currentDeadlineCount),
        totalFaultedPeriods: Number(d.totalFaultedPeriods),
        totalProofs: Number(d.totalProofs),
        totalRoots: Number(d.totalRoots),
        totalDataSize: String(d.totalDataSize),
        leafCount: Number(d.leafCount),
      }))
      if (result.length) this.setCache(cacheKey, result, DATASET_CACHE_TTL)
      return result
    })
  }

  async getDataset(network: NetworkName, setId: string): Promise<SubgraphDataSet | null> {
    const id = parseUint256(setId)
    const cacheKey = `${network}:dataset:${id}`
    const cached = this.getCached<SubgraphDataSet>(cacheKey)
    if (cached !== undefined) return cached

    return this.requests.run(cacheKey, async () => {
      const data = await this.query(network, `{
        dataSets(where: { setId: ${id} }) {
          setId isActive provenThisPeriod nextDeadline lastProvenEpoch
          currentDeadlineCount totalFaultedPeriods totalProofs
          totalRoots totalDataSize leafCount
        }
      }`)
      const raw = data.dataSets as Array<Record<string, string | boolean>>
      if (!raw.length) return null

      const d = raw[0]
      const result: SubgraphDataSet = {
        setId: String(d.setId),
        isActive: Boolean(d.isActive),
        provenThisPeriod: Boolean(d.provenThisPeriod),
        nextDeadline: String(d.nextDeadline),
        lastProvenEpoch: String(d.lastProvenEpoch),
        currentDeadlineCount: Number(d.currentDeadlineCount),
        totalFaultedPeriods: Number(d.totalFaultedPeriods),
        totalProofs: Number(d.totalProofs),
        totalRoots: Number(d.totalRoots),
        totalDataSize: String(d.totalDataSize),
        leafCount: Number(d.leafCount),
      }
      this.setCache(cacheKey, result, DATASET_CACHE_TTL)
      return result
    })
  }

  /** Full proving health for one provider: aggregates + weekly breakdown + per-dataset status. */
  async getProviderProvingHealth(network: NetworkName, address: string, weeks: number = 4): Promise<ProviderProvingHealth | null> {
    const addr = parseAddress(address)
    const weekCount = parseWeeks(weeks)
    const provider = await this.getProvider(network, addr)
    if (!provider) return null

    const [weeklyActivity, datasets] = await Promise.all([
      this.getProviderWeekly(network, addr, weekCount),
      this.getProviderDatasets(network, addr),
    ])

    return { provider, weeklyActivity, datasets }
  }
}
