/**
 * Indexes burnForFees calls on the FilecoinPay contract.
 *
 * burnForFees has no event, so we watch all transactions TO the contract
 * and filter by the function selector (first 4 bytes of input).
 *
 * burnForFees(address token, address recipient, uint256 requested) payable
 */

import { ponder } from "ponder:registry"
import * as schema from "ponder:schema"
import { decodeFunctionData } from "viem"
import { txEventId, eventMeta } from "./event-utils.js"

const burnForFeesAbi = [
  {
    type: "function",
    name: "burnForFees",
    inputs: [
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
      { name: "requested", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const

ponder.on("FilecoinPayAccount:transaction:to", async ({ event, context }) => {
  const { transaction } = event

  if (!transaction.input || transaction.input.length < 10) return

  let decoded
  try {
    decoded = decodeFunctionData({ abi: burnForFeesAbi, data: transaction.input })
  } catch {
    return
  }

  if (decoded.functionName !== "burnForFees") return

  const [token, recipient, requested] = decoded.args

  await context.db
    .insert(schema.fpBurnForFees)
    .values({
      id: txEventId(event),
      token, recipient,
      requestedAmount: requested,
      filBurned: transaction.value,
      caller: transaction.from,
      ...eventMeta(event),
    })
})
