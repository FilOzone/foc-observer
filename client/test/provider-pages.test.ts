import { describe, expect, test } from "vitest"
import { listProviderPages, type ProviderPageResult } from "../src/provider-pages.js"

describe("provider pagination", () => {
  test("follows the cursor and aggregates incomplete pages", async () => {
    const requests: Array<string | undefined> = []
    const pages: Record<string, ProviderPageResult> = {
      "1": {
        providers: [{ providerId: "1" }],
        complete: false,
        truncated: true,
        nextId: "101",
        providerStatusAvailable: true,
        capabilitiesAvailable: false,
        unavailableProviderIds: ["2"],
      },
      "101": {
        providers: [{ providerId: "101" }],
        complete: true,
        truncated: false,
        nextId: null,
        providerStatusAvailable: true,
        capabilitiesAvailable: true,
        unavailableProviderIds: [],
      },
    }

    const result = await listProviderPages(async (startId) => {
      requests.push(startId)
      const page = pages[startId ?? "1"]
      if (!page) throw new Error(`Unexpected cursor ${startId}`)
      return page
    })

    expect(requests).toEqual([undefined, "101"])
    expect(result).toMatchObject({
      providers: [{ providerId: "1" }, { providerId: "101" }],
      complete: false,
      truncated: false,
      nextId: null,
      unavailableProviderIds: ["2"],
      capabilitiesAvailable: false,
    })
  })

  test("is complete after every page succeeds", async () => {
    const pages: Record<string, ProviderPageResult> = {
      "1": {
        providers: [{ providerId: "1" }],
        complete: false,
        truncated: true,
        nextId: "101",
        providerStatusAvailable: true,
        capabilitiesAvailable: true,
      },
      "101": {
        providers: [{ providerId: "101" }],
        complete: true,
        truncated: false,
        nextId: null,
        providerStatusAvailable: true,
        capabilitiesAvailable: true,
      },
    }

    const result = await listProviderPages(async (startId) => {
      const page = pages[startId ?? "1"]
      if (!page) throw new Error(`Unexpected cursor ${startId}`)
      return page
    })

    expect(result).toMatchObject({
      complete: true,
      providerStatusAvailable: true,
      capabilitiesAvailable: true,
      nextId: null,
    })
  })

  test("does not certify a response that omits availability metadata", async () => {
    const result = await listProviderPages(async () => ({
      providers: [],
      complete: true,
      nextId: null,
    }))
    expect(result).toMatchObject({
      complete: false,
      providerStatusAvailable: false,
      capabilitiesAvailable: false,
    })
  })

  test("uses an explicit start ID for the first page", async () => {
    const requests: Array<string | undefined> = []
    await listProviderPages(async (startId) => {
      requests.push(startId)
      return { providers: [], nextId: null }
    }, "101")
    expect(requests).toEqual(["101"])
  })

  test("rejects a non-advancing cursor", async () => {
    await expect(listProviderPages(async () => ({
      providers: [],
      nextId: "1",
    }))).rejects.toThrow("cursor did not advance")
  })
})
