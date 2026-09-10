import assert from "node:assert/strict"
import { test } from "node:test"
import { decodeEventLog, encodeAbiParameters, encodeEventTopics } from "viem"
import { PoRepMarketAbi } from "../abis/PoRepMarket.ts"
import { PoRepValidatorFactoryAbi } from "../abis/PoRepValidatorFactory.ts"

const hex = (s: string) => s as `0x${string}`

test("PoRepMarket ABI decodes RailIdUpdated with a bigint rail id for the fp_rail_created join", () => {
  const [t0, t1, t2] = encodeEventTopics({ abi: PoRepMarketAbi, eventName: "RailIdUpdated", args: { dealId: 7n, railId: 41n } })
  if (typeof t1 !== "string" || typeof t2 !== "string") throw new Error("expected two indexed topics")
  const d = decodeEventLog({ abi: PoRepMarketAbi, data: "0x", topics: [t0, t1, t2] })
  assert.equal(d.eventName, "RailIdUpdated")
  assert.equal(d.args.dealId, 7n)
  assert.equal(d.args.railId, 41n)
  assert.equal(typeof d.args.railId, "bigint")
})

test("PoRepValidatorFactory ABI decodes ProxyCreated with an address comparable to fp_rail_created.operator", () => {
  const proxy = hex(`0x${"ab".repeat(20)}`)
  const [t0, t1, t2] = encodeEventTopics({ abi: PoRepValidatorFactoryAbi, eventName: "ProxyCreated", args: { proxy, dealId: 7n } })
  if (typeof t1 !== "string" || typeof t2 !== "string") throw new Error("expected two indexed topics")
  const d = decodeEventLog({ abi: PoRepValidatorFactoryAbi, data: "0x", topics: [t0, t1, t2] })
  assert.equal(d.eventName, "ProxyCreated")
  assert.equal(d.args.proxy.toLowerCase(), proxy)
  assert.equal(d.args.dealId, 7n)
})

test("PoRepMarket ABI decodes DealProposalCreated requirements as numbers", () => {
  const client = hex(`0x${"cd".repeat(20)}`)
  const [t0, t1, t2, t3] = encodeEventTopics({ abi: PoRepMarketAbi, eventName: "DealProposalCreated", args: { dealId: 7n, client, provider: 1234n } })
  if (typeof t1 !== "string" || typeof t2 !== "string" || typeof t3 !== "string") throw new Error("expected three indexed topics")
  const data = encodeAbiParameters(
    [
      { type: "tuple", components: [{ name: "retrievabilityBps", type: "uint16" }, { name: "bandwidthMbps", type: "uint16" }, { name: "latencyMs", type: "uint16" }, { name: "indexingPct", type: "uint8" }] },
      { type: "string" }, { type: "uint256" }, { type: "uint256" },
    ],
    [{ retrievabilityBps: 9500, bandwidthMbps: 100, latencyMs: 250, indexingPct: 80 }, "ipfs://manifest", 1024n, 5_934_202n],
  )
  const d = decodeEventLog({ abi: PoRepMarketAbi, data, topics: [t0, t1, t2, t3] })
  assert.equal(d.eventName, "DealProposalCreated")
  assert.equal(d.args.provider, 1234n)
  assert.equal(typeof d.args.requirements.retrievabilityBps, "number")
  assert.equal(d.args.requirements.retrievabilityBps, 9500)
  assert.equal(d.args.manifestLocation, "ipfs://manifest")
  // Pin the tail: the deployed event has no manifestHash, so these follow the string directly.
  assert.equal(d.args.totalDealSize, 1024n)
  assert.equal(d.args.proposedAtBlock, 5_934_202n)
})
