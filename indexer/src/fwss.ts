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
  fwssDataSetAuthorizerSet,
  fwssPdpPaymentTerminated,
  fwssCdnPaymentTerminated,
  fwssCdnRailsToppedUp,
  fwssCdnServiceTerminated,
  fwssDataSetAbandoned,
  fwssStorageTermsRegistered,
  fwssStorageTermsDisabled,
  fwssDataSetStorageTermsSelected,
  fwssDiamondDelegateCall,
  fwssSelectorDelegated,
  fwssErc1967Upgraded,
  contractUpgraded,
  upgradeAnnounced,
  ownershipTransferred,
  fwssServiceDeployed,
  fwssFilbeamControllerChanged,
  fwssViewContractSet,
} from "ponder:schema"
import { decodePiece } from "./cid-utils.js"
import { eventId, eventMeta, storageTermsSelectionRow } from "./event-utils.js"
import { recordTx } from "./tx-meta.js"

ponder.on("FWSSV15:DiamondDelegateCall", async ({ event, context }) => {
  await recordTx(event, context)
  const { delegate, delegateCalldata } = event.args
  await context.db.insert(fwssDiamondDelegateCall).values({
    id: eventId(event),
    delegate,
    delegateCalldata,
    logIndex: event.log.logIndex,
    ...eventMeta(event),
  })
})

ponder.on("FWSSV15:SelectorDelegated", async ({ event, context }) => {
  await recordTx(event, context)
  const { selector, delegate } = event.args
  await context.db.insert(fwssSelectorDelegated).values({
    id: eventId(event),
    selector,
    delegate,
    logIndex: event.log.logIndex,
    ...eventMeta(event),
  })
})

ponder.on("FWSSV15:Upgraded", async ({ event, context }) => {
  await recordTx(event, context)
  const { implementation } = event.args
  await context.db.insert(fwssErc1967Upgraded).values({
    id: eventId(event),
    implementation,
    logIndex: event.log.logIndex,
    ...eventMeta(event),
  })
})

ponder.on("FWSSV16:StorageTermsRegistered", async ({ event, context }) => {
  await recordTx(event, context)
  const { storageTermsId, terms } = event.args
  const { token, tokenDecimals, salt, pricePerTiBPerMonth } = terms
  await context.db.insert(fwssStorageTermsRegistered).values({
    id: eventId(event),
    storageTermsId,
    token,
    tokenDecimals,
    salt,
    pricePerTibPerMonth: pricePerTiBPerMonth,
    logIndex: event.log.logIndex,
    ...eventMeta(event),
  })
})

ponder.on("FWSSV16:StorageTermsDisabled", async ({ event, context }) => {
  await recordTx(event, context)
  const { storageTermsId } = event.args
  await context.db.insert(fwssStorageTermsDisabled).values({
    id: eventId(event),
    storageTermsId,
    logIndex: event.log.logIndex,
    ...eventMeta(event),
  })
})

ponder.on("FWSSV16:DataSetStorageTermsSelected", async ({ event, context }) => {
  await recordTx(event, context)
  await context.db.insert(fwssDataSetStorageTermsSelected).values(storageTermsSelectionRow(event))
})

ponder.on("FWSS:DataSetCreated", async ({ event, context }) => {
  await recordTx(event, context)
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
  await recordTx(event, context)
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
  await recordTx(event, context)
  const { dataSetId, periodsFaulted, deadline } = event.args
  await context.db
    .insert(fwssFaultRecord)
    .values({ id: eventId(event), dataSetId, periodsFaulted, deadline, ...eventMeta(event) })
})

ponder.on("FWSS:RailRateUpdated", async ({ event, context }) => {
  await recordTx(event, context)
  const { dataSetId, railId, newRate } = event.args
  await context.db
    .insert(fwssRailRateUpdated)
    .values({ id: eventId(event), dataSetId, railId, newRate, ...eventMeta(event) })
})

ponder.on("FWSS:ServiceTerminated", async ({ event, context }) => {
  await recordTx(event, context)
  const { approver, dataSetId, pdpRailId, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(fwssServiceTerminated)
    .values({
      id: eventId(event),
      approver, dataSetId, pdpRailId, cacheMissRailId, cdnRailId,
      ...eventMeta(event),
    })
})

ponder.on("FWSS:PricingUpdated", async ({ event, context }) => {
  await recordTx(event, context)
  const { storagePrice, minimumRate } = event.args
  await context.db
    .insert(fwssPricingUpdated)
    .values({ id: eventId(event), storagePrice, minimumRate, ...eventMeta(event) })
})

ponder.on("FWSS:ProviderApproved", async ({ event, context }) => {
  await recordTx(event, context)
  const { providerId } = event.args
  await context.db
    .insert(fwssProviderApproved)
    .values({ id: eventId(event), providerId, ...eventMeta(event) })
})

ponder.on("FWSS:ProviderUnapproved", async ({ event, context }) => {
  await recordTx(event, context)
  const { providerId } = event.args
  await context.db
    .insert(fwssProviderUnapproved)
    .values({ id: eventId(event), providerId, ...eventMeta(event) })
})

ponder.on("FWSS:DataSetServiceProviderChanged", async ({ event, context }) => {
  await recordTx(event, context)
  const { dataSetId, oldServiceProvider, newServiceProvider } = event.args
  await context.db
    .insert(fwssDataSetSPChanged)
    .values({ id: eventId(event), dataSetId, oldServiceProvider, newServiceProvider, ...eventMeta(event) })
})

ponder.on("FWSSV14:DataSetAuthorizerSet", async ({ event, context }) => {
  await recordTx(event, context)
  const { dataSetId, authorizer } = event.args
  await context.db
    .insert(fwssDataSetAuthorizerSet)
    .values({ id: eventId(event), dataSetId, authorizer, ...eventMeta(event) })
})

ponder.on("FWSS:PDPPaymentTerminated", async ({ event, context }) => {
  await recordTx(event, context)
  const { dataSetId, endEpoch, pdpRailId } = event.args
  await context.db
    .insert(fwssPdpPaymentTerminated)
    .values({ id: eventId(event), dataSetId, endEpoch, pdpRailId, ...eventMeta(event) })
})

ponder.on("FWSS:CDNPaymentTerminated", async ({ event, context }) => {
  await recordTx(event, context)
  const { dataSetId, endEpoch, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(fwssCdnPaymentTerminated)
    .values({ id: eventId(event), dataSetId, endEpoch, cacheMissRailId, cdnRailId, ...eventMeta(event) })
})

ponder.on("FWSS:CDNServiceTerminated", async ({ event, context }) => {
  await recordTx(event, context)
  const { caller, dataSetId, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(fwssCdnServiceTerminated)
    .values({ id: eventId(event), caller, dataSetId, cacheMissRailId, cdnRailId, ...eventMeta(event) })
})

ponder.on("FWSS:CDNPaymentRailsToppedUp", async ({ event, context }) => {
  await recordTx(event, context)
  const { dataSetId, cdnAmountAdded, totalCdnLockup, cacheMissAmountAdded, totalCacheMissLockup } = event.args
  await context.db
    .insert(fwssCdnRailsToppedUp)
    .values({
      id: eventId(event), dataSetId,
      cdnAmountAdded, totalCdnLockup, cacheMissAmountAdded, totalCacheMissLockup,
      ...eventMeta(event),
    })
})

ponder.on("FWSS:DataSetAbandoned", async ({ event, context }) => {
  await recordTx(event, context)
  const { dataSetId, pdpRailId, cacheMissRailId, cdnRailId } = event.args
  await context.db
    .insert(fwssDataSetAbandoned)
    .values({ id: eventId(event), dataSetId, pdpRailId, cacheMissRailId, cdnRailId, ...eventMeta(event) })
})

ponder.on("FWSS:ContractUpgraded", async ({ event, context }) => {
  await recordTx(event, context)
  const { version, implementation } = event.args
  await context.db
    .insert(contractUpgraded)
    .values({ id: eventId(event), contract: "FWSS", version, implementation, ...eventMeta(event) })
})

ponder.on("FWSS:FilecoinServiceDeployed", async ({ event, context }) => {
  await recordTx(event, context)
  const { name, description } = event.args
  await context.db
    .insert(fwssServiceDeployed)
    .values({ id: eventId(event), name, description, ...eventMeta(event) })
})

ponder.on("FWSS:FilBeamControllerChanged", async ({ event, context }) => {
  await recordTx(event, context)
  const { oldController, newController } = event.args
  await context.db
    .insert(fwssFilbeamControllerChanged)
    .values({ id: eventId(event), oldController, newController, ...eventMeta(event) })
})

ponder.on("FWSS:ViewContractSet", async ({ event, context }) => {
  await recordTx(event, context)
  const { viewContract } = event.args
  await context.db
    .insert(fwssViewContractSet)
    .values({ id: eventId(event), viewContract, ...eventMeta(event) })
})

ponder.on("FWSS:UpgradeAnnounced", async ({ event, context }) => {
  await recordTx(event, context)
  const { nextImplementation, afterEpoch } = event.args.plannedUpgrade
  await context.db
    .insert(upgradeAnnounced)
    .values({ id: eventId(event), contract: "FWSS", nextImplementation, afterEpoch, ...eventMeta(event) })
})

ponder.on("FWSS:OwnershipTransferred", async ({ event, context }) => {
  await recordTx(event, context)
  const { previousOwner, newOwner } = event.args
  await context.db
    .insert(ownershipTransferred)
    .values({ id: eventId(event), contract: "FWSS", previousOwner, newOwner, ...eventMeta(event) })
})
