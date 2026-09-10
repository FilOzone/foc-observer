import assert from "node:assert/strict"
import { test } from "node:test"
import { txMetaRow } from "../src/event-utils.ts"

const hex = (s: string) => s as `0x${string}`
const base = {
  transaction: { hash: hex("0xabc"), from: hex("0xf00"), to: hex("0xba5"), input: hex("0x9afd37f2ff"), value: 5n },
  transactionReceipt: { gasUsed: 21000n, effectiveGasPrice: 1000n, status: "success" as const },
  block: { number: 100n, timestamp: 1757000000n },
}

test("builds the full tx_meta row", () => {
  assert.deepEqual(txMetaRow(base), {
    id: hex("0xabc"),
    txHash: hex("0xabc"),
    blockNumber: 100n,
    timestamp: 1757000000n,
    txFrom: hex("0xf00"),
    txTo: hex("0xba5"),
    txSelector: "0x9afd37f2",
    txValue: 5n,
    gasUsed: 21000n,
    effectiveGasPrice: 1000n,
    status: "0x1",
  })
})

test("maps receipt status to hex text", () => {
  assert.equal(txMetaRow(base).status, "0x1")
  const reverted = { ...base, transactionReceipt: { ...base.transactionReceipt, status: "reverted" as const } }
  assert.equal(txMetaRow(reverted).status, "0x0")
})

test("selector is the first four bytes, or null when input is shorter", () => {
  for (const input of ["0x", "0x9afd37"]) {
    assert.equal(txMetaRow({ ...base, transaction: { ...base.transaction, input: hex(input) } }).txSelector, null)
  }
  assert.equal(txMetaRow({ ...base, transaction: { ...base.transaction, input: hex("0x9afd37f2") } }).txSelector, "0x9afd37f2")
})

test("to is null for contract creation", () => {
  assert.equal(txMetaRow({ ...base, transaction: { ...base.transaction, to: null } }).txTo, null)
})
