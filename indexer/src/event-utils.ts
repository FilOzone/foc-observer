/** Shared helpers for Ponder event handlers. */

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
