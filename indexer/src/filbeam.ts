import { ponder } from "ponder:registry"
import {
  fbUsageReported,
  fbCdnSettlement,
  fbCacheMissSettlement,
  fbPaymentRailsTerminated,
  fbControllerUpdated,
  fbFwssFilbeamControllerChanged,
  fbOwnershipTransferred,
} from "ponder:schema"
import { eventId, eventMeta } from "./event-utils.js"

ponder.on("FilBeamOperator:UsageReported", async ({ event, context }) => {
  const { dataSetId, fromEpoch, toEpoch, cdnBytesUsed, cacheMissBytesUsed } = event.args
  await context.db
    .insert(fbUsageReported)
    .values({
      id: eventId(event),
      operator: event.log.address,
      dataSetId, fromEpoch, toEpoch, cdnBytesUsed, cacheMissBytesUsed,
      ...eventMeta(event),
    })
})

ponder.on("FilBeamOperator:CDNSettlement", async ({ event, context }) => {
  const { dataSetId, cdnAmount } = event.args
  await context.db
    .insert(fbCdnSettlement)
    .values({
      id: eventId(event),
      operator: event.log.address,
      dataSetId, cdnAmount,
      ...eventMeta(event),
    })
})

ponder.on("FilBeamOperator:CacheMissSettlement", async ({ event, context }) => {
  const { dataSetId, cacheMissAmount } = event.args
  await context.db
    .insert(fbCacheMissSettlement)
    .values({
      id: eventId(event),
      operator: event.log.address,
      dataSetId, cacheMissAmount,
      ...eventMeta(event),
    })
})

ponder.on("FilBeamOperator:PaymentRailsTerminated", async ({ event, context }) => {
  const { dataSetId } = event.args
  await context.db
    .insert(fbPaymentRailsTerminated)
    .values({
      id: eventId(event),
      operator: event.log.address,
      dataSetId,
      ...eventMeta(event),
    })
})

ponder.on("FilBeamOperator:FilBeamControllerUpdated", async ({ event, context }) => {
  const { oldController, newController } = event.args
  await context.db
    .insert(fbControllerUpdated)
    .values({
      id: eventId(event),
      operator: event.log.address,
      oldController, newController,
      ...eventMeta(event),
    })
})

ponder.on("FilBeamOperator:FwssFilBeamControllerChanged", async ({ event, context }) => {
  const { previousController, newController } = event.args
  await context.db
    .insert(fbFwssFilbeamControllerChanged)
    .values({
      id: eventId(event),
      operator: event.log.address,
      previousController, newController,
      ...eventMeta(event),
    })
})

ponder.on("FilBeamOperator:OwnershipTransferred", async ({ event, context }) => {
  const { previousOwner, newOwner } = event.args
  await context.db
    .insert(fbOwnershipTransferred)
    .values({
      id: eventId(event),
      operator: event.log.address,
      previousOwner, newOwner,
      ...eventMeta(event),
    })
})
