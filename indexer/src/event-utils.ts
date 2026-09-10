/** Shared helpers for Ponder event handlers. */

import type { Hex } from "viem"

/** Unique event ID from block hash + log index. */
export function eventId(event: { block: { hash: string }; log: { logIndex: number } }) {
  return `${event.block.hash}-${event.log.logIndex}`
}

/** Transaction ID from block hash + transaction index (for account/tx handlers without log index). */
export function txEventId(event: { block: { hash: string }; transaction: { transactionIndex: number } }) {
  return `${event.block.hash}-${event.transaction.transactionIndex}`
}

export function eventMeta(event: {
  transaction: { hash: string }
  block: { number: bigint; timestamp: bigint }
}) {
  return {
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  }
}

/**
 * tx_meta row for the transaction carrying an event. status is hex text
 * ('0x1' success, '0x0' revert) to match eth_getTransactionReceipt.
 */
export function txMetaRow(event: {
  transaction: { hash: Hex; from: Hex; to: Hex | null; input: Hex; value: bigint }
  transactionReceipt: { gasUsed: bigint; effectiveGasPrice: bigint; status: "success" | "reverted" }
  block: { number: bigint; timestamp: bigint }
}) {
  const { transaction, transactionReceipt: receipt } = event
  return {
    id: transaction.hash,
    ...eventMeta(event),
    txFrom: transaction.from,
    txTo: transaction.to,
    txSelector: transaction.input.length >= 10 ? transaction.input.slice(0, 10) : null,
    txValue: transaction.value,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    status: receipt.status === "success" ? "0x1" : "0x0",
  }
}
