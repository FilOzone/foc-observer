import { ponder } from "ponder:registry"
import {
  storachaFwssDataSetCreated,
  storachaFwssPieceAdded,
  storachaFwssFaultRecord,
  storachaFwssRailRateUpdated,
  storachaFwssServiceTerminated,
  storachaFwssPricingUpdated,
  storachaFwssProviderApproved,
  storachaFwssProviderUnapproved,
  storachaFwssDataSetSpChanged,
  storachaFwssPdpPaymentTerminated,
  storachaFwssCdnPaymentTerminated,
  storachaFwssCdnServiceTerminated,
  storachaFwssCdnRailsToppedUp,
  storachaFwssContractUpgraded,
  storachaFwssUpgradeAnnounced,
  storachaFwssOwnershipTransferred,
  storachaFwssServiceDeployed,
  storachaFwssFilbeamControllerChanged,
  storachaFwssViewContractSet,
} from "ponder:schema"
import { decodePiece } from "./cid-utils.js"
import { eventId, eventMeta } from "./event-utils.js"

ponder.on("StorachaFWSS:DataSetCreated", async ({ event, context }) => {
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
    .insert(storachaFwssDataSetCreated)
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

ponder.on("StorachaFWSS:PieceAdded", async ({ event, context }) => {
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
    .insert(storachaFwssPieceAdded)
    .values({
      id: eventId(event),
      dataSetId, pieceId, pieceCid, rawSize, metadata,
      ...eventMeta(event),
    })
})

ponder.on("StorachaFWSS:FaultRecord", async ({ event, context }) => {
  const { dataSetId, periodsFaulted, deadline } = event.args
  await context.db
    .insert(storachaFwssFaultRecord)
    .values({ id: eventId(event), dataSetId, periodsFaulted, deadline, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:RailRateUpdated", async ({ event, context }) => {
  const { dataSetId, railId, newRate } = event.args
  await context.db
    .insert(storachaFwssRailRateUpdated)
    .values({ id: eventId(event), dataSetId, railId, newRate, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:ServiceTerminated", async ({ event, context }) => {
  const { caller, dataSetId, pdpRailId, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(storachaFwssServiceTerminated)
    .values({
      id: eventId(event),
      caller, dataSetId, pdpRailId, cacheMissRailId, cdnRailId,
      ...eventMeta(event),
    })
})

ponder.on("StorachaFWSS:PricingUpdated", async ({ event, context }) => {
  const { storagePrice, minimumRate } = event.args
  await context.db
    .insert(storachaFwssPricingUpdated)
    .values({ id: eventId(event), storagePrice, minimumRate, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:ProviderApproved", async ({ event, context }) => {
  const { providerId } = event.args
  await context.db
    .insert(storachaFwssProviderApproved)
    .values({ id: eventId(event), providerId, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:ProviderUnapproved", async ({ event, context }) => {
  const { providerId } = event.args
  await context.db
    .insert(storachaFwssProviderUnapproved)
    .values({ id: eventId(event), providerId, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:DataSetServiceProviderChanged", async ({ event, context }) => {
  const { dataSetId, oldServiceProvider, newServiceProvider } = event.args
  await context.db
    .insert(storachaFwssDataSetSpChanged)
    .values({ id: eventId(event), dataSetId, oldServiceProvider, newServiceProvider, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:PDPPaymentTerminated", async ({ event, context }) => {
  const { dataSetId, endEpoch, pdpRailId } = event.args
  await context.db
    .insert(storachaFwssPdpPaymentTerminated)
    .values({ id: eventId(event), dataSetId, endEpoch, pdpRailId, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:CDNPaymentTerminated", async ({ event, context }) => {
  const { dataSetId, endEpoch, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(storachaFwssCdnPaymentTerminated)
    .values({ id: eventId(event), dataSetId, endEpoch, cacheMissRailId, cdnRailId, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:CDNServiceTerminated", async ({ event, context }) => {
  const { caller, dataSetId, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(storachaFwssCdnServiceTerminated)
    .values({ id: eventId(event), caller, dataSetId, cacheMissRailId, cdnRailId, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:CDNPaymentRailsToppedUp", async ({ event, context }) => {
  const { dataSetId, cdnAmountAdded, totalCdnLockup, cacheMissAmountAdded, totalCacheMissLockup } = event.args
  await context.db
    .insert(storachaFwssCdnRailsToppedUp)
    .values({
      id: eventId(event), dataSetId,
      cdnAmountAdded, totalCdnLockup, cacheMissAmountAdded, totalCacheMissLockup,
      ...eventMeta(event),
    })
})

ponder.on("StorachaFWSS:ContractUpgraded", async ({ event, context }) => {
  const { version, implementation } = event.args
  await context.db
    .insert(storachaFwssContractUpgraded)
    .values({ id: eventId(event), version, implementation, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:FilecoinServiceDeployed", async ({ event, context }) => {
  const { name, description } = event.args
  await context.db
    .insert(storachaFwssServiceDeployed)
    .values({ id: eventId(event), name, description, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:FilBeamControllerChanged", async ({ event, context }) => {
  const { oldController, newController } = event.args
  await context.db
    .insert(storachaFwssFilbeamControllerChanged)
    .values({ id: eventId(event), oldController, newController, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:ViewContractSet", async ({ event, context }) => {
  const { viewContract } = event.args
  await context.db
    .insert(storachaFwssViewContractSet)
    .values({ id: eventId(event), viewContract, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:UpgradeAnnounced", async ({ event, context }) => {
  const { nextImplementation, afterEpoch } = event.args.plannedUpgrade
  await context.db
    .insert(storachaFwssUpgradeAnnounced)
    .values({ id: eventId(event), nextImplementation, afterEpoch, ...eventMeta(event) })
})

ponder.on("StorachaFWSS:OwnershipTransferred", async ({ event, context }) => {
  const { previousOwner, newOwner } = event.args
  await context.db
    .insert(storachaFwssOwnershipTransferred)
    .values({ id: eventId(event), previousOwner, newOwner, ...eventMeta(event) })
})
