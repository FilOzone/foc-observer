import assert from "node:assert/strict"
import { test } from "node:test"
import { storageTermsSelectionRow } from "../src/event-utils.ts"

test("records an explicit legacy storage terms selection", () => {
  const storageTermsId = "0x0000000000000000000000000000000000000000000000000000000000000000" as const
  const row = storageTermsSelectionRow({
    args: { dataSetId: 55_252n, storageTermsId },
    log: { logIndex: 3 },
    block: { hash: "0xblock", number: 4_256_439n, timestamp: 1_763_849_600n },
    transaction: { hash: "0xtx" },
  })

  assert.deepEqual(row, {
    id: "0xblock-3",
    dataSetId: 55_252n,
    storageTermsId,
    logIndex: 3,
    txHash: "0xtx",
    blockNumber: 4_256_439n,
    timestamp: 1_763_849_600n,
  })
})
