import { afterEach, describe, expect, test, vi } from "vitest"
import { PublicError, ServiceUnavailableError } from "../src/public-error.js"
import { BoundedCache, fetchText, RequestCoalescer } from "../src/upstream.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("BoundedCache", () => {
  test("evicts the least recently used entry at capacity", () => {
    const cache = new BoundedCache<string>(2)
    cache.set("first", "one", 1_000)
    cache.set("second", "two", 1_000)
    expect(cache.get("first")).toBe("one")
    cache.set("third", "three", 1_000)

    expect(cache.get("second")).toBeUndefined()
    expect(cache.get("first")).toBe("one")
    expect(cache.get("third")).toBe("three")
  })
})

describe("RequestCoalescer", () => {
  test("reports capacity exhaustion as unavailable", async () => {
    const coalescer = new RequestCoalescer(1)
    const { promise, resolve } = Promise.withResolvers<string>()
    const pending = coalescer.run("first", () => promise)

    await expect(coalescer.run("second", async () => "second")).rejects.toBeInstanceOf(ServiceUnavailableError)
    resolve("first")
    await pending
  })
})

describe("fetchText", () => {
  test("rejects oversized responses with a safe error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(4))))

    await expect(fetchText("https://upstream.invalid", {}, 3)).rejects.toBeInstanceOf(PublicError)
  })

  test("redacts network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(
      new Error("https://upstream.invalid/private-token"),
      { code: "ECONNRESET" },
    )))

    await expect(fetchText("https://upstream.invalid")).rejects.toMatchObject({
      message: "Upstream request failed.",
    })
  })
})
