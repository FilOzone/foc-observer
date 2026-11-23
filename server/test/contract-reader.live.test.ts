/**
 * Live integration tests against calibnet contracts.
 * Requires a calibnet RPC endpoint at localhost:1235.
 * Run with: npm run test:live
 */

import { describe, expect, test } from "vitest"
import { ContractReader } from "../src/contract-reader.js"
import { getNetworkConfig } from "../src/networks.js"

const LIVE = process.env.LIVE_TEST === "1"

describe.skipIf(!LIVE)("ContractReader against calibnet", () => {
  const reader = new ContractReader(getNetworkConfig("calibnet"))

  test("getProvider returns provider with name", async () => {
    const provider = await reader.getProvider(2n)
    expect(provider.providerId).toBe("2")
    expect(provider.name).toBeTruthy()
    expect(typeof provider.name).toBe("string")
    expect(provider.serviceProvider).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(typeof provider.isActive).toBe("boolean")
  }, 30_000)

  test("getProviderCount returns counts", async () => {
    const counts = await reader.getProviderCount()
    expect(Number(counts.total)).toBeGreaterThan(0)
    expect(Number(counts.active)).toBeGreaterThan(0)
    expect(Number(counts.active)).toBeLessThanOrEqual(Number(counts.total))
  }, 30_000)

  test("getDataset returns dataset with metadata", async () => {
    // Find a recent dataset from Ponder
    const dataset = await reader.getDataset(11141n)
    expect(dataset.dataSetId).toBe("11141")
    expect(dataset.providerId).toBeTruthy()
    expect(dataset.payer).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(dataset.pdpRailId).toBeTruthy()
    expect(dataset.cdnRailId).toBeTruthy()
    expect(dataset.cacheMissRailId).toBeTruthy()
    expect(typeof dataset.terminated).toBe("boolean")
    expect(dataset.storageTerms.id).toMatch(/^0x[a-fA-F0-9]{64}$/)
    expect(dataset.storageTerms.tokenDecimals).toBeGreaterThanOrEqual(0)
    expect(typeof dataset.storageTerms.enabled).toBe("boolean")
    expect(typeof dataset.metadata).toBe("object")
  }, 30_000)

  test("getDatasetProving returns proving state", async () => {
    const proving = await reader.getDatasetProving(11141n)
    expect(proving.dataSetId).toBe("11141")
    if (proving.live) {
      expect(typeof proving.provenThisPeriod).toBe("boolean")
      expect(proving.lastProvenEpoch).toBeTruthy()
      expect(proving.leafCount).toBeTruthy()
      expect(proving.activePieceCount).toBeTruthy()
    } else {
      expect(proving.provenThisPeriod).toBeNull()
      expect(proving.lastProvenEpoch).toBeNull()
      expect(proving.provingDeadline).toBeNull()
      expect(proving.nextChallengeEpoch).toBeNull()
      expect(proving.leafCount).toBeNull()
      expect(proving.activePieceCount).toBeNull()
    }
  }, 30_000)

  test("getRail returns rail details for active rail", async () => {
    // Use a recently created rail
    const rail = await reader.getRail(13602n)
    expect(rail.railId).toBe("13602")
    expect(rail.from).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(rail.to).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(rail.paymentRateFormatted).toBeTruthy()
    expect(typeof rail.terminated).toBe("boolean")
  }, 30_000)

  test("getRail throws for finalized rail", async () => {
    // Rail 12174 is finalized (zeroed out)
    await expect(reader.getRail(12174n)).rejects.toThrow()
  }, 30_000)

  test("getAllProviders returns providers with tiers", async () => {
    const providers = await reader.getAllProviders()
    expect(providers.length).toBeGreaterThan(0)

    // Every provider should have the expected fields
    for (const p of providers) {
      expect(p.providerId).toBeTruthy()
      expect(typeof p.name).toBe("string")
      expect(typeof p.isActive).toBe("boolean")
      expect(typeof p.isApproved).toBe("boolean")
      expect(typeof p.isEndorsed).toBe("boolean")
    }

    // Endorsed is a subset of approved
    const endorsed = providers.filter((p) => p.isEndorsed)
    for (const p of endorsed) {
      expect(p.isApproved).toBe(true)
    }

    // There should be at least some approved and some endorsed on calibnet
    expect(providers.some((p) => p.isApproved)).toBe(true)
    expect(providers.some((p) => p.isEndorsed)).toBe(true)
    expect(providers.some((p) => !p.isApproved)).toBe(true)
  }, 30_000)

  test("getPricing returns the deployed version and monthly rates", async () => {
    const pricing = await reader.getPricing()
    expect(pricing.fwssVersion).toBeTruthy()
    expect(pricing.token).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(Number(pricing.storagePrice)).toBeGreaterThan(0)
    expect(Number(pricing.datasetFeePerMonth)).toBeGreaterThan(0)
  }, 30_000)
})
