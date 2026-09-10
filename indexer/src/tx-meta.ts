import type { Context } from "ponder:registry"
import { txMeta } from "ponder:schema"
import { txMetaRow } from "./event-utils.js"

/**
 * Records the transaction behind an event in tx_meta. Every handler calls this
 * first; a transaction carrying several events hits it several times and the
 * conflict on the tx-hash id drops the repeats.
 */
export async function recordTx(event: Parameters<typeof txMetaRow>[0], context: { db: Context["db"] }) {
  await context.db.insert(txMeta).values(txMetaRow(event)).onConflictDoNothing()
}
