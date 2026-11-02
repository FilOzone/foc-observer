import { afterEach, describe, expect, test, vi } from "vitest"
import { BetterStackClient, parseBucket } from "../src/betterstack-client.js"

describe("parseBucket", () => {
  test("valid buckets", () => {
    expect(parseBucket("1h")).toBe(1)
    expect(parseBucket("6h")).toBe(6)
    expect(parseBucket("24h")).toBe(24)
    expect(parseBucket("7d")).toBe(168)
  })

  test("invalid bucket throws", () => {
    expect(() => parseBucket("2h")).toThrow(/Invalid bucket/)
    expect(() => parseBucket("")).toThrow(/Invalid bucket/)
    expect(() => parseBucket("30d")).toThrow(/Invalid bucket/)
  })
})

describe("BetterStackClient", () => {
  test("isConfigured returns false without credentials", () => {
    const client = new BetterStackClient("", "")
    expect(client.isConfigured()).toBe(false)
  })

  test("isConfigured returns true with credentials", () => {
    const client = new BetterStackClient("user", "pass")
    expect(client.isConfigured()).toBe(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("validateProviderId rejects non-numeric", async () => {
    const client = new BetterStackClient("user", "pass")
    await expect(client.getProviderDetail("calibnet", "abc", 72)).rejects.toThrow(/Invalid provider ID/)
  })

  test("validateProviderId accepts numeric", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch reached")))
    const client = new BetterStackClient("user", "pass")
    await expect(client.getProviderDetail("calibnet", "123", 72)).rejects.toThrow("fetch reached")
  })
})
