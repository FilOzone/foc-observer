import { describe, expect, test } from "vitest"
import { getNetworkConfig, resolveNetworkFromEnv, ALL_NETWORKS } from "../src/networks.js"

describe("getNetworkConfig", () => {
  test("calibnet has correct chain ID", () => {
    const config = getNetworkConfig("calibnet")
    expect(config.chainId).toBe(314159)
    expect(config.provingPeriodEpochs).toBe(240)
  })

  test("mainnet has correct chain ID", () => {
    const config = getNetworkConfig("mainnet")
    expect(config.chainId).toBe(314)
    expect(config.provingPeriodEpochs).toBe(2880)
  })

  test("overrides replace defaults", () => {
    const config = getNetworkConfig("calibnet", {
      databaseUrl: "postgres://custom:1234/db",
      rpcUrl: "http://custom:5678/rpc/v1",
    })
    expect(config.databaseUrl).toBe("postgres://custom:1234/db")
    expect(config.rpcUrl).toBe("http://custom:5678/rpc/v1")
  })

  test("contract addresses are present for all networks", () => {
    for (const name of ALL_NETWORKS) {
      const config = getNetworkConfig(name)
      expect(config.contracts.pdpVerifier).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(config.contracts.fwss).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(config.contracts.fwssStateView).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(config.contracts.filecoinPay).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(config.contracts.spRegistry).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(config.contracts.sessionKeyRegistry).toMatch(/^0x[a-fA-F0-9]{40}$/)
    }
  })

  test("calibnet and mainnet have different addresses", () => {
    const cal = getNetworkConfig("calibnet")
    const main = getNetworkConfig("mainnet")
    expect(cal.contracts.pdpVerifier).not.toBe(main.contracts.pdpVerifier)
    expect(cal.contracts.fwss).not.toBe(main.contracts.fwss)
  })
})

describe("resolveNetworkFromEnv", () => {
  test("defaults to calibnet", () => {
    delete process.env.FOC_NETWORK
    expect(resolveNetworkFromEnv()).toBe("calibnet")
  })

  test("respects FOC_NETWORK=mainnet", () => {
    process.env.FOC_NETWORK = "mainnet"
    expect(resolveNetworkFromEnv()).toBe("mainnet")
    delete process.env.FOC_NETWORK
  })

  test("falls back to calibnet for invalid value", () => {
    process.env.FOC_NETWORK = "bogus"
    expect(resolveNetworkFromEnv()).toBe("calibnet")
    delete process.env.FOC_NETWORK
  })
})
