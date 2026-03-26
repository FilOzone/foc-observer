import { ponder } from "ponder:registry"
import {
  fwssDataSetCreated,
  fwssPieceAdded,
  fwssFaultRecord,
  fwssRailRateUpdated,
  fwssServiceTerminated,
  fwssPricingUpdated,
  fwssProviderApproved,
  fwssProviderUnapproved,
  fwssDataSetSPChanged,
  fwssPdpPaymentTerminated,
  fwssCdnPaymentTerminated,
  fwssCdnServiceTerminated,
  fwssCdnRailsToppedUp,
  contractUpgraded,
} from "ponder:schema"
import { decodePiece } from "./cid-utils.js"
import { eventId, eventMeta } from "./event-utils.js"

ponder.on("FWSS:DataSetCreated", async ({ event, context }) => {
  const {
    dataSetId, providerId, pdpRailId, cacheMissRailId, cdnRailId,
    payer, serviceProvider, payee, metadataKeys, metadataValues,
  } = event.args

  const metaMap: Record<string, string> = {}
  const keys = metadataKeys ?? []
  const values = metadataValues ?? []
  for (let i = 0; i < keys.length; i++) {
    metaMap[keys[i]] = values[i] ?? ""
  }

  await context.db
    .insert(fwssDataSetCreated)
    .values({
      id: eventId(event),
      dataSetId, providerId, pdpRailId, cacheMissRailId, cdnRailId,
      payer, serviceProvider, payee,
      source: metaMap.source ?? null,
      withCDN: "withCDN" in metaMap,
      metadata: Object.keys(metaMap).length > 0 ? JSON.stringify(metaMap) : null,
      ...eventMeta(event),
    })
})

ponder.on("FWSS:PieceAdded", async ({ event, context }) => {
  const { dataSetId, pieceId, pieceCid: pieceCidRaw, keys, values } = event.args

  let pieceCid = pieceCidRaw.data as string
  let rawSize = 0n
  try {
    const decoded = decodePiece(pieceCidRaw)
    pieceCid = decoded.cid
    rawSize = decoded.rawSize
  } catch {
    // Fall back to hex if CID parsing fails
  }

  let metadata: string | null = null
  if (keys?.length) {
    const metaMap: Record<string, string> = {}
    for (let i = 0; i < keys.length; i++) {
      metaMap[keys[i]] = values?.[i] ?? ""
    }
    metadata = JSON.stringify(metaMap)
  }

  await context.db
    .insert(fwssPieceAdded)
    .values({
      id: eventId(event),
      dataSetId, pieceId, pieceCid, rawSize, metadata,
      ...eventMeta(event),
    })
})

ponder.on("FWSS:FaultRecord", async ({ event, context }) => {
  const { dataSetId, periodsFaulted, deadline } = event.args
  await context.db
    .insert(fwssFaultRecord)
    .values({ id: eventId(event), dataSetId, periodsFaulted, deadline, ...eventMeta(event) })
})

ponder.on("FWSS:RailRateUpdated", async ({ event, context }) => {
  const { dataSetId, railId, newRate } = event.args
  await context.db
    .insert(fwssRailRateUpdated)
    .values({ id: eventId(event), dataSetId, railId, newRate, ...eventMeta(event) })
})

ponder.on("FWSS:ServiceTerminated", async ({ event, context }) => {
  const { caller, dataSetId, pdpRailId, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(fwssServiceTerminated)
    .values({
      id: eventId(event),
      caller, dataSetId, pdpRailId, cacheMissRailId, cdnRailId,
      ...eventMeta(event),
    })
})

ponder.on("FWSS:PricingUpdated", async ({ event, context }) => {
  const { storagePrice, minimumRate } = event.args
  await context.db
    .insert(fwssPricingUpdated)
    .values({ id: eventId(event), storagePrice, minimumRate, ...eventMeta(event) })
})

ponder.on("FWSS:ProviderApproved", async ({ event, context }) => {
  const { providerId } = event.args
  await context.db
    .insert(fwssProviderApproved)
    .values({ id: eventId(event), providerId, ...eventMeta(event) })
})

ponder.on("FWSS:ProviderUnapproved", async ({ event, context }) => {
  const { providerId } = event.args
  await context.db
    .insert(fwssProviderUnapproved)
    .values({ id: eventId(event), providerId, ...eventMeta(event) })
})

ponder.on("FWSS:DataSetServiceProviderChanged", async ({ event, context }) => {
  const { dataSetId, oldServiceProvider, newServiceProvider } = event.args
  await context.db
    .insert(fwssDataSetSPChanged)
    .values({ id: eventId(event), dataSetId, oldServiceProvider, newServiceProvider, ...eventMeta(event) })
})

ponder.on("FWSS:PDPPaymentTerminated", async ({ event, context }) => {
  const { dataSetId, endEpoch, pdpRailId } = event.args
  await context.db
    .insert(fwssPdpPaymentTerminated)
    .values({ id: eventId(event), dataSetId, endEpoch, pdpRailId, ...eventMeta(event) })
})

ponder.on("FWSS:CDNPaymentTerminated", async ({ event, context }) => {
  const { dataSetId, endEpoch, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(fwssCdnPaymentTerminated)
    .values({ id: eventId(event), dataSetId, endEpoch, cacheMissRailId, cdnRailId, ...eventMeta(event) })
})

ponder.on("FWSS:CDNServiceTerminated", async ({ event, context }) => {
  const { caller, dataSetId, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(fwssCdnServiceTerminated)
    .values({ id: eventId(event), caller, dataSetId, cacheMissRailId, cdnRailId, ...eventMeta(event) })
})

ponder.on("FWSS:CDNPaymentRailsToppedUp", async ({ event, context }) => {
  const { dataSetId, cdnAmountAdded, totalCdnLockup, cacheMissAmountAdded, totalCacheMissLockup } = event.args
  await context.db
    .insert(fwssCdnRailsToppedUp)
    .values({
      id: eventId(event), dataSetId,
      cdnAmountAdded, totalCdnLockup, cacheMissAmountAdded, totalCacheMissLockup,
      ...eventMeta(event),
    })
})

ponder.on("FWSS:ContractUpgraded", async ({ event, context }) => {
  const { version, implementation } = event.args
  await context.db
    .insert(contractUpgraded)
    .values({ id: eventId(event), contract: "FWSS", version, implementation, ...eventMeta(event) })
})
