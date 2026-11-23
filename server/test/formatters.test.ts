import { expect, test } from "vitest"
import { columnNotes } from "../src/table-metadata.js"

test("discovery reports units for a specific table rather than assuming units by column name", () => {
  expect(columnNotes("tx_meta").get("tx_value")).toMatch(/attoFIL/)
  expect(columnNotes("pdp_proof_fee_paid").get("fee")).toMatch(/FIL/)
  expect(columnNotes("pdp_proof_fee_paid").has("tx_value")).toBe(false)
  expect(columnNotes("constructor").size).toBe(0)
})
