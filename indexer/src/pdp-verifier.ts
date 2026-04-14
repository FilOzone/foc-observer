import { ponder } from "ponder:registry"
import {
  pdpDataSetCreated,
  pdpNextProvingPeriod,
  pdpProofFeePaid,
  pdpPossessionProven,
  pdpDataSetDeleted,
  pdpPiecesAdded,
  pdpPiecesRemoved,
  pdpStorageProviderChanged,
  pdpDataSetEmpty,
  pdpFeeUpdateProposed,
  contractUpgraded,
  upgradeAnnounced,
  ownershipTransferred,
} from "ponder:schema"
import { decodePiece } from "./cid-utils.js"
import { eventId, eventMeta } from "./event-utils.js"

ponder.on("PDPVerifier:DataSetCreated", async ({ event, context }) => {
  const { setId, storageProvider } = event.args
  await context.db
    .insert(pdpDataSetCreated)
    .values({ id: eventId(event), setId, storageProvider, ...eventMeta(event) })
})

ponder.on("PDPVerifier:NextProvingPeriod", async ({ event, context }) => {
  const { setId, challengeEpoch, leafCount } = event.args
  await context.db
    .insert(pdpNextProvingPeriod)
    .values({ id: eventId(event), setId, challengeEpoch, leafCount, ...eventMeta(event) })
})

ponder.on("PDPVerifier:ProofFeePaid", async ({ event, context }) => {
  const { setId, fee } = event.args
  await context.db
    .insert(pdpProofFeePaid)
    .values({ id: eventId(event), setId, fee, ...eventMeta(event) })
})

ponder.on("PDPVerifier:PossessionProven", async ({ event, context }) => {
  const { setId, challenges } = event.args

  const challengeCount = challenges?.length ?? 0
  const challengeData = challengeCount > 0
    ? JSON.stringify(challenges.map((c: { pieceId: bigint; offset: bigint }) => ({
        pieceId: Number(c.pieceId),
        offset: c.offset.toString(),
      })))
    : null

  await context.db
    .insert(pdpPossessionProven)
    .values({ id: eventId(event), setId, challengeCount, challenges: challengeData, ...eventMeta(event) })
})

ponder.on("PDPVerifier:DataSetDeleted", async ({ event, context }) => {
  const { setId, deletedLeafCount } = event.args
  await context.db
    .insert(pdpDataSetDeleted)
    .values({ id: eventId(event), setId, deletedLeafCount, ...eventMeta(event) })
})

ponder.on("PDPVerifier:PiecesAdded", async ({ event, context }) => {
  const { setId, pieceIds, pieceCids: pieceCidsRaw } = event.args

  let pieces: string | null = null
  try {
    pieces = JSON.stringify(pieceCidsRaw.map((c: { data: `0x${string}` }, i: number) => {
      const decoded = decodePiece(c)
      return { id: Number(pieceIds[i]), cid: decoded.cid, size: decoded.rawSize.toString() }
    }))
  } catch {
    // Fall back to null if CID parsing fails
  }

  await context.db
    .insert(pdpPiecesAdded)
    .values({ id: eventId(event), setId, pieceCount: pieceIds.length, pieces, ...eventMeta(event) })
})

ponder.on("PDPVerifier:PiecesRemoved", async ({ event, context }) => {
  const { setId, pieceIds } = event.args
  const pieceIdArr = pieceIds.length > 0 ? JSON.stringify(pieceIds.map((id: bigint) => Number(id))) : null
  await context.db
    .insert(pdpPiecesRemoved)
    .values({ id: eventId(event), setId, pieceCount: pieceIds.length, pieceIds: pieceIdArr, ...eventMeta(event) })
})

ponder.on("PDPVerifier:StorageProviderChanged", async ({ event, context }) => {
  const { setId, oldStorageProvider, newStorageProvider } = event.args
  await context.db
    .insert(pdpStorageProviderChanged)
    .values({ id: eventId(event), setId, oldStorageProvider, newStorageProvider, ...eventMeta(event) })
})

ponder.on("PDPVerifier:DataSetEmpty", async ({ event, context }) => {
  const { setId } = event.args
  await context.db
    .insert(pdpDataSetEmpty)
    .values({ id: eventId(event), setId, ...eventMeta(event) })
})

ponder.on("PDPVerifier:FeeUpdateProposed", async ({ event, context }) => {
  const { currentFee, newFee, effectiveTime } = event.args
  await context.db
    .insert(pdpFeeUpdateProposed)
    .values({ id: eventId(event), currentFee, newFee, effectiveTime, ...eventMeta(event) })
})

ponder.on("PDPVerifier:ContractUpgraded", async ({ event, context }) => {
  const { version, implementation } = event.args
  await context.db
    .insert(contractUpgraded)
    .values({ id: eventId(event), contract: "PDPVerifier", version, implementation, ...eventMeta(event) })
})

ponder.on("PDPVerifier:UpgradeAnnounced", async ({ event, context }) => {
  const { nextImplementation, afterEpoch } = event.args.plannedUpgrade
  await context.db
    .insert(upgradeAnnounced)
    .values({ id: eventId(event), contract: "PDPVerifier", nextImplementation, afterEpoch, ...eventMeta(event) })
})

ponder.on("PDPVerifier:OwnershipTransferred", async ({ event, context }) => {
  const { previousOwner, newOwner } = event.args
  await context.db
    .insert(ownershipTransferred)
    .values({ id: eventId(event), contract: "PDPVerifier", previousOwner, newOwner, ...eventMeta(event) })
})
