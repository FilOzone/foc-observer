/**
 * Local proving health computation from Ponder-indexed events.
 *
 * Uses only pdp_* tables (protocol layer, operator-agnostic). Does NOT depend
 * on fwss_fault_record or any service-contract-specific events.
 *
 * Fault detection uses the proof-gap method with inferred skipped periods:
 *   1. For each pair of consecutive nextProvingPeriod events, compute the epoch gap
 *   2. Derive the dataset's proving period from the mode of observed gaps
 *   3. If the gap spans multiple proving periods, the extra periods are inferred faults
 *   4. For the observed period, check if a proof exists in the window
 *
 * The proving period is derived per-dataset from actual data (mode of gaps >= 100 epochs),
 * so it works for any listener contract (FWSS=2880, Storacha=2880, calibnet=240, future configs).
 */

import type { PonderClient } from "./ponder-client.js"

export interface ProvingProvider {
  address: string
  totalProvingPeriods: number
  totalFaultedPeriods: number
  totalProvedPeriods: number
  totalDataSets: number
  activeDataSets: number
  faultRate: number
}

export interface ProvingDataSet {
  setId: string
  provingPeriod: number
  totalProvingPeriods: number
  totalFaultedPeriods: number
  totalProvedPeriods: number
  lastPeriodTs: string
  lastProofTs: string | null
  faultRate: number
}

export interface WeeklyProvingActivity {
  week: string
  provingPeriods: number
  faults: number
  proofs: number
  datasetsCreated: number
  piecesAdded: number
}

export interface ProviderProvingHealth {
  provider: ProvingProvider
  weeklyActivity: WeeklyProvingActivity[]
  datasets: ProvingDataSet[]
}

export class ProvingClient {
  private ponder: PonderClient
  constructor(ponder: PonderClient) {
    this.ponder = ponder
  }

  private async sql(query: string): Promise<Record<string, unknown>[]> {
    const result = await this.ponder.queryInternal(query)
    return result.rows as Record<string, unknown>[]
  }

  /**
   * Core CTE for proving analysis with gap-based fault inference.
   *
   * 1. Computes the proving period per dataset from the mode of epoch gaps (>= 100)
   * 2. For each consecutive pair, counts how many proving periods fit in the gap
   * 3. Extra periods beyond 1 are inferred skipped faults
   * 4. The observed period is faulted if no proof exists in the window
   */
  private provingCTE(whereClause: string): string {
    return `
      WITH raw_periods AS (
        SELECT
          n.set_id,
          n.block_number,
          n.timestamp,
          LAG(n.block_number) OVER (PARTITION BY n.set_id ORDER BY n.block_number) as prev_block,
          LAG(n.timestamp) OVER (PARTITION BY n.set_id ORDER BY n.timestamp) as prev_ts,
          d.storage_provider
        FROM pdp_next_proving_period n
        JOIN pdp_data_set_created d ON n.set_id = d.set_id
        ${whereClause}
      ),
      gaps AS (
        SELECT set_id, block_number - prev_block as gap
        FROM raw_periods WHERE prev_block IS NOT NULL AND block_number - prev_block >= 100
      ),
      dataset_period AS (
        SELECT set_id, gap as proving_period
        FROM (
          SELECT set_id, gap, ROW_NUMBER() OVER (PARTITION BY set_id ORDER BY COUNT(*) DESC) as rn
          FROM gaps GROUP BY set_id, gap
        ) ranked WHERE rn = 1
      ),
      classified AS (
        SELECT
          r.set_id,
          r.block_number,
          r.timestamp,
          r.prev_block,
          r.prev_ts,
          r.storage_provider,
          COALESCE(dp.proving_period, 2880) as proving_period,
          CASE WHEN r.prev_block IS NULL THEN 1
               ELSE GREATEST(FLOOR((r.block_number - r.prev_block)::numeric / COALESCE(dp.proving_period, 2880)), 1)::int
          END as periods_in_gap,
          CASE WHEN r.prev_block IS NULL THEN false
               WHEN EXISTS (
                 SELECT 1 FROM pdp_possession_proven pr
                 WHERE pr.set_id = r.set_id
                   AND pr.timestamp > r.prev_ts
                   AND pr.timestamp <= r.timestamp
               ) THEN false
               ELSE true
          END as observed_fault
        FROM raw_periods r
        LEFT JOIN dataset_period dp ON r.set_id = dp.set_id
      )`
  }

  async getProviders(): Promise<ProvingProvider[]> {
    const rows = await this.sql(`
      ${this.provingCTE("")}
      SELECT
        c.storage_provider as address,
        SUM(c.periods_in_gap)::int as total_periods,
        (SUM(CASE WHEN c.periods_in_gap > 1 THEN c.periods_in_gap - 1 ELSE 0 END)
         + COUNT(CASE WHEN c.observed_fault AND c.prev_block IS NOT NULL THEN 1 END))::int as faulted_periods
      FROM classified c
      GROUP BY c.storage_provider
      ORDER BY total_periods DESC
    `)

    // Dataset counts: "active" means not deleted, not emptied, and has proved in last 3 proving periods
    // This avoids the subgraph's isActive inflation problem
    const staleCutoff = Math.floor(Date.now() / 1000) - 3 * 86400
    const dsRows = await this.sql(`
      SELECT
        d.storage_provider as address,
        COUNT(DISTINCT d.set_id) as total_datasets,
        COUNT(DISTINCT CASE
          WHEN del.set_id IS NOT NULL THEN NULL
          WHEN emp.set_id IS NOT NULL THEN NULL
          WHEN recent.set_id IS NULL THEN NULL
          ELSE d.set_id
        END) as active_datasets
      FROM pdp_data_set_created d
      LEFT JOIN pdp_data_set_deleted del ON d.set_id = del.set_id
      LEFT JOIN pdp_data_set_empty emp ON d.set_id = emp.set_id
      LEFT JOIN (
        SELECT DISTINCT set_id FROM pdp_next_proving_period WHERE timestamp > ${staleCutoff}
      ) recent ON d.set_id = recent.set_id
      GROUP BY d.storage_provider
    `)
    const dsMap = new Map<string, { total: number; active: number }>()
    for (const r of dsRows) {
      dsMap.set(String(r.address).toLowerCase(), {
        total: Number(r.total_datasets),
        active: Number(r.active_datasets),
      })
    }

    return rows.map(r => {
      const addr = String(r.address).toLowerCase()
      const total = Number(r.total_periods)
      const faults = Number(r.faulted_periods)
      const ds = dsMap.get(addr) ?? { total: 0, active: 0 }
      return {
        address: addr,
        totalProvingPeriods: total,
        totalFaultedPeriods: faults,
        totalProvedPeriods: total - faults,
        totalDataSets: ds.total,
        activeDataSets: ds.active,
        faultRate: total > 0 ? Math.round((faults / total) * 10000) / 100 : 0,
      }
    })
  }

  async getProviderHealth(address: string, weeks: number = 4): Promise<ProviderProvingHealth | null> {
    const addr = address.toLowerCase()
    const where = `WHERE LOWER(d.storage_provider) = '${addr}'`

    // All-time stats
    const statsRows = await this.sql(`
      ${this.provingCTE(where)}
      SELECT
        SUM(periods_in_gap)::int as total_periods,
        (SUM(CASE WHEN periods_in_gap > 1 THEN periods_in_gap - 1 ELSE 0 END)
         + COUNT(CASE WHEN observed_fault AND prev_block IS NOT NULL THEN 1 END))::int as faulted_periods
      FROM classified
    `)
    const stats = statsRows[0]
    if (!stats || Number(stats.total_periods) === 0) {
      const exists = await this.sql(`SELECT set_id FROM pdp_data_set_created WHERE LOWER(storage_provider) = '${addr}' LIMIT 1`)
      if (exists.length === 0) return null
    }

    const staleCutoff = Math.floor(Date.now() / 1000) - 3 * 86400
    const dsRows = await this.sql(`
      SELECT
        COUNT(DISTINCT d.set_id) as total_datasets,
        COUNT(DISTINCT CASE
          WHEN del.set_id IS NOT NULL THEN NULL
          WHEN emp.set_id IS NOT NULL THEN NULL
          WHEN recent.set_id IS NULL THEN NULL
          ELSE d.set_id
        END) as active_datasets
      FROM pdp_data_set_created d
      LEFT JOIN pdp_data_set_deleted del ON d.set_id = del.set_id
      LEFT JOIN pdp_data_set_empty emp ON d.set_id = emp.set_id
      LEFT JOIN (
        SELECT DISTINCT set_id FROM pdp_next_proving_period WHERE timestamp > ${staleCutoff}
      ) recent ON d.set_id = recent.set_id
      WHERE LOWER(d.storage_provider) = '${addr}'
    `)
    const ds = dsRows[0] ?? { total_datasets: 0, active_datasets: 0 }
    const totalPeriods = Number(stats?.total_periods ?? 0)
    const totalFaults = Number(stats?.faulted_periods ?? 0)

    // Weekly breakdown
    const cutoff = Math.floor(Date.now() / 1000) - weeks * 7 * 86400
    const weeklyRows = await this.sql(`
      ${this.provingCTE(where)}
      SELECT
        DATE_TRUNC('week', TO_TIMESTAMP(timestamp)) as week,
        SUM(periods_in_gap)::int as periods,
        (SUM(CASE WHEN periods_in_gap > 1 THEN periods_in_gap - 1 ELSE 0 END)
         + COUNT(CASE WHEN observed_fault AND prev_block IS NOT NULL THEN 1 END))::int as faults
      FROM classified
      WHERE timestamp > ${cutoff}
      GROUP BY week ORDER BY week DESC
    `)

    const dsActivity = await this.sql(`
      SELECT DATE_TRUNC('week', TO_TIMESTAMP(timestamp)) as week, COUNT(*) as n
      FROM pdp_data_set_created WHERE LOWER(storage_provider) = '${addr}' AND timestamp > ${cutoff}
      GROUP BY week
    `)
    const dsActMap = new Map<string, number>()
    for (const r of dsActivity) dsActMap.set(String(r.week), Number(r.n))

    const pieceActivity = await this.sql(`
      SELECT DATE_TRUNC('week', TO_TIMESTAMP(p.timestamp)) as week, COUNT(*) as n
      FROM pdp_pieces_added p JOIN pdp_data_set_created d ON p.set_id = d.set_id
      WHERE LOWER(d.storage_provider) = '${addr}' AND p.timestamp > ${cutoff}
      GROUP BY week
    `)
    const pieceMap = new Map<string, number>()
    for (const r of pieceActivity) pieceMap.set(String(r.week), Number(r.n))

    const weeklyActivity: WeeklyProvingActivity[] = weeklyRows.map(r => {
      const week = String(r.week)
      const periods = Number(r.periods)
      const faults = Number(r.faults)
      return {
        week: week.split("T")[0],
        provingPeriods: periods,
        faults,
        proofs: periods - faults,
        datasetsCreated: dsActMap.get(week) ?? 0,
        piecesAdded: pieceMap.get(week) ?? 0,
      }
    })

    // Per-dataset status
    const datasetRows = await this.sql(`
      ${this.provingCTE(where)}
      SELECT
        set_id,
        MAX(proving_period)::int as proving_period,
        SUM(periods_in_gap)::int as total_periods,
        (SUM(CASE WHEN periods_in_gap > 1 THEN periods_in_gap - 1 ELSE 0 END)
         + COUNT(CASE WHEN observed_fault AND prev_block IS NOT NULL THEN 1 END))::int as faulted_periods,
        MAX(timestamp) as last_period_ts
      FROM classified
      GROUP BY set_id ORDER BY set_id
    `)

    const proofRows = await this.sql(`
      SELECT pr.set_id, MAX(pr.timestamp) as last_proof_ts
      FROM pdp_possession_proven pr
      JOIN pdp_data_set_created d ON pr.set_id = d.set_id
      WHERE LOWER(d.storage_provider) = '${addr}'
      GROUP BY pr.set_id
    `)
    const proofMap = new Map<string, string>()
    for (const r of proofRows) proofMap.set(String(r.set_id), String(r.last_proof_ts))

    const datasets: ProvingDataSet[] = datasetRows.map(r => {
      const total = Number(r.total_periods)
      const faults = Number(r.faulted_periods)
      const sid = String(r.set_id)
      return {
        setId: sid,
        provingPeriod: Number(r.proving_period),
        totalProvingPeriods: total,
        totalFaultedPeriods: faults,
        totalProvedPeriods: total - faults,
        lastPeriodTs: String(r.last_period_ts),
        lastProofTs: proofMap.get(sid) ?? null,
        faultRate: total > 0 ? Math.round((faults / total) * 10000) / 100 : 0,
      }
    })

    return {
      provider: {
        address: addr,
        totalProvingPeriods: totalPeriods,
        totalFaultedPeriods: totalFaults,
        totalProvedPeriods: totalPeriods - totalFaults,
        totalDataSets: Number(ds.total_datasets),
        activeDataSets: Number(ds.active_datasets),
        faultRate: totalPeriods > 0 ? Math.round((totalFaults / totalPeriods) * 10000) / 100 : 0,
      },
      weeklyActivity,
      datasets,
    }
  }

  async getDataset(setId: string): Promise<ProvingDataSet | null> {
    const rows = await this.sql(`
      ${this.provingCTE(`WHERE n.set_id = ${setId}`)}
      SELECT
        set_id,
        MAX(proving_period)::int as proving_period,
        SUM(periods_in_gap)::int as total_periods,
        (SUM(CASE WHEN periods_in_gap > 1 THEN periods_in_gap - 1 ELSE 0 END)
         + COUNT(CASE WHEN observed_fault AND prev_block IS NOT NULL THEN 1 END))::int as faulted_periods,
        MAX(timestamp) as last_period_ts
      FROM classified
      GROUP BY set_id
    `)

    if (rows.length === 0) return null
    const r = rows[0]

    const proofRows = await this.sql(`
      SELECT MAX(timestamp) as last_proof_ts FROM pdp_possession_proven WHERE set_id = ${setId}
    `)

    const total = Number(r.total_periods)
    const faults = Number(r.faulted_periods)
    return {
      setId: String(r.set_id),
      provingPeriod: Number(r.proving_period),
      totalProvingPeriods: total,
      totalFaultedPeriods: faults,
      totalProvedPeriods: total - faults,
      lastPeriodTs: String(r.last_period_ts),
      lastProofTs: proofRows[0]?.last_proof_ts ? String(proofRows[0].last_proof_ts) : null,
      faultRate: total > 0 ? Math.round((faults / total) * 10000) / 100 : 0,
    }
  }
}
