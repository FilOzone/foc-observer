import assert from "node:assert/strict"
import { test } from "node:test"
import { decodeEventLog, encodeAbiParameters, encodeEventTopics } from "viem"
import { PDPVerifierAbi } from "../abis/PDPVerifier.ts"
import { decodePackedPiece, decodePackedPieces, decodePiece } from "../src/cid-utils.ts"

const root = `0x${"11".repeat(32)}` as `0x${string}`
const cidData = `0x01559120220002${root.slice(2)}` as `0x${string}`
const packedCid = {
  header: `0x${"00".repeat(25)}01559120220002` as `0x${string}`,
  root,
}

test("reconstructs a packed CID without removing zero bytes inside its header", () => {
  assert.deepEqual(decodePackedPiece(packedCid), decodePiece({ data: cidData }))
  assert.equal(decodePackedPiece(packedCid).rawSize, 127n)
})

test("derives consecutive piece IDs for a PiecesAddedV2 batch", () => {
  const pieces = decodePackedPieces(41n, [packedCid, packedCid])
  assert.deepEqual(pieces.map(({ id }) => id), [41, 42])
  assert.equal(pieces[0]?.size, "127")
})

test("PDPVerifier ABI decodes PiecesAddedV2", () => {
  const topics = encodeEventTopics({
    abi: PDPVerifierAbi,
    eventName: "PiecesAddedV2",
    args: { setId: 7n },
  })
  const setIdTopic = topics[1]
  if (typeof setIdTopic !== "string") throw new Error("expected an encoded setId topic")
  const data = encodeAbiParameters(
    [
      { type: "uint256" },
      {
        type: "tuple[]",
        components: [
          { name: "header", type: "bytes32" },
          { name: "root", type: "bytes32" },
        ],
      },
    ],
    [41n, [packedCid]],
  )

  const decoded = decodeEventLog({ abi: PDPVerifierAbi, data, topics: [topics[0], setIdTopic] })
  assert.equal(decoded.eventName, "PiecesAddedV2")
  assert.equal(decoded.args.setId, 7n)
  assert.equal(decoded.args.firstPieceId, 41n)
  assert.deepEqual(decoded.args.pieceCids, [packedCid])
})
