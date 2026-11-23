import assert from "node:assert/strict"
import { test } from "node:test"
import { decodeEventLog, encodeAbiParameters, encodeEventTopics, getAddress } from "viem"
import { FilecoinWarmStorageServiceAbi } from "../abis/FilecoinWarmStorageService.ts"
import { PDPVerifierAbi } from "../abis/PDPVerifier.ts"

test("PDPVerifier ABI decodes PiecesScheduledForRemoval", () => {
  const topics = encodeEventTopics({
    abi: PDPVerifierAbi,
    eventName: "PiecesScheduledForRemoval",
    args: { setId: 7n },
  })
  const setIdTopic = topics[1]
  if (typeof setIdTopic !== "string") throw new Error("expected an encoded setId topic")
  const data = encodeAbiParameters([{ type: "uint256[]" }], [[41n, 42n]])

  const decoded = decodeEventLog({ abi: PDPVerifierAbi, data, topics: [topics[0], setIdTopic] })
  assert.equal(decoded.eventName, "PiecesScheduledForRemoval")
  assert.equal(decoded.args.setId, 7n)
  assert.deepEqual(decoded.args.pieceIds, [41n, 42n])
})

test("PiecesScheduledForRemoval is distinct from PiecesRemoved", () => {
  const [scheduled] = encodeEventTopics({ abi: PDPVerifierAbi, eventName: "PiecesScheduledForRemoval" })
  const [removed] = encodeEventTopics({ abi: PDPVerifierAbi, eventName: "PiecesRemoved" })
  assert.notEqual(scheduled, removed)
})

test("FWSS ABI decodes DataSetAuthorizerSet", () => {
  const authorizer = `0x${"ab".repeat(20)}` as `0x${string}`
  const topics = encodeEventTopics({
    abi: FilecoinWarmStorageServiceAbi,
    eventName: "DataSetAuthorizerSet",
    args: { dataSetId: 12n, authorizer },
  })
  const [topic0, dataSetIdTopic, authorizerTopic] = topics
  if (typeof dataSetIdTopic !== "string" || typeof authorizerTopic !== "string") {
    throw new Error("expected encoded dataSetId and authorizer topics")
  }

  const decoded = decodeEventLog({
    abi: FilecoinWarmStorageServiceAbi,
    data: "0x",
    topics: [topic0, dataSetIdTopic, authorizerTopic],
  })
  assert.equal(decoded.eventName, "DataSetAuthorizerSet")
  assert.equal(decoded.args.dataSetId, 12n)
  assert.equal(decoded.args.authorizer.toLowerCase(), authorizer)
})

test("FWSS ABI decodes storage terms registration", () => {
  const storageTermsId = `0x${"cd".repeat(32)}` as `0x${string}`
  const token = `0x${"ab".repeat(20)}` as `0x${string}`
  const salt = `0x${"ef".repeat(32)}` as `0x${string}`
  const topics = encodeEventTopics({
    abi: FilecoinWarmStorageServiceAbi,
    eventName: "StorageTermsRegistered",
    args: { storageTermsId },
  })
  const storageTermsIdTopic = topics[1]
  if (typeof storageTermsIdTopic !== "string") throw new Error("expected an encoded storage terms ID topic")
  const data = encodeAbiParameters([{
    type: "tuple",
    components: [
      { type: "address" },
      { type: "uint8" },
      { type: "bytes32" },
      { type: "uint96" },
    ],
  }], [[token, 6, salt, 2_500_000n]])

  const decoded = decodeEventLog({
    abi: FilecoinWarmStorageServiceAbi,
    data,
    topics: [topics[0], storageTermsIdTopic],
  })
  assert.equal(decoded.eventName, "StorageTermsRegistered")
  assert.equal(decoded.args.storageTermsId, storageTermsId)
  assert.deepEqual(decoded.args.terms, {
    token: getAddress(token),
    tokenDecimals: 6,
    salt,
    pricePerTiBPerMonth: 2_500_000n,
  })
})

test("FWSS ABI includes v1.5 dispatcher and v1.6 storage terms events", () => {
  const eventNames = new Set(
    (FilecoinWarmStorageServiceAbi as readonly { type: string; name?: string }[])
      .filter((item) => item.type === "event")
      .map((item) => item.name),
  )

  assert(eventNames.has("DiamondDelegateCall"))
  assert(eventNames.has("SelectorDelegated"))
  assert(eventNames.has("Upgraded"))
  assert(eventNames.has("StorageTermsDisabled"))
  assert(eventNames.has("DataSetStorageTermsSelected"))
})
