/** Shared helpers for Ponder event handlers. */

/** Unique event ID from block hash + log index. */
export function eventId(event: { block: { hash: string }; log: { logIndex: number } }) {
  return `${event.block.hash}-${event.log.logIndex}`
}

/** Transaction ID from block hash + transaction index (for account/tx handlers without log index). */
export function txEventId(event: { block: { hash: string }; transaction: { transactionIndex: number } }) {
  return `${event.block.hash}-${event.transaction.transactionIndex}`
}

/** Standard metadata fields present on every indexed event row. */
export function eventMeta(event: {
  transaction: { hash: string; from: string; value: bigint }
  transactionReceipt?: { gasUsed: bigint; effectiveGasPrice: bigint } | null
  block: { number: bigint; timestamp: bigint }
}) {
  return {
    txHash: event.transaction.hash,
    txFrom: event.transaction.from,
    txValue: event.transaction.value,
    gasUsed: event.transactionReceipt!.gasUsed,
    effectiveGasPrice: event.transactionReceipt!.effectiveGasPrice,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  }
}
