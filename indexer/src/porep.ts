import { ponder } from "ponder:registry"
import {
  porepDealProposalCreated,
  porepDealAccepted,
  porepValidatorUpdated,
  porepRailIdUpdated,
  porepDealCompleted,
  porepDealTerminated,
  porepDealRejected,
  porepDealProposalExpired,
  porepProxyCreated,
  porepSpRegistered,
  porepSpPayeeUpdated,
  porepSpPriceUpdated,
  porepSpCapabilitiesUpdated,
  porepSliAttestationUpdate,
} from "ponder:schema"
import { eventId, eventMeta } from "./event-utils.js"

/** SLIThresholds tuple -> flat integer columns. Fields are uint16/uint8, safe as JS numbers. */
function sliColumns(t: {
  retrievabilityBps: number | bigint
  bandwidthMbps: number | bigint
  latencyMs: number | bigint
  indexingPct: number | bigint
}) {
  return {
    retrievabilityBps: Number(t.retrievabilityBps),
    bandwidthMbps: Number(t.bandwidthMbps),
    latencyMs: Number(t.latencyMs),
    indexingPct: Number(t.indexingPct),
  }
}

// -- PoRepMarket: deal lifecycle --

ponder.on("PoRepMarket:DealProposalCreated", async ({ event, context }) => {
  const { dealId, client, provider, requirements, manifestLocation, manifestHash, totalDealSize, proposedAtBlock } =
    event.args
  await context.db.insert(porepDealProposalCreated).values({
    id: eventId(event),
    dealId,
    client,
    providerId: provider,
    ...sliColumns(requirements),
    manifestLocation,
    manifestHash,
    totalDealSize,
    proposedAtBlock,
    ...eventMeta(event),
  })
})

ponder.on("PoRepMarket:DealAccepted", async ({ event, context }) => {
  const { dealId, owner, provider } = event.args
  await context.db
    .insert(porepDealAccepted)
    .values({ id: eventId(event), dealId, owner, providerId: provider, ...eventMeta(event) })
})

ponder.on("PoRepMarket:ValidatorUpdated", async ({ event, context }) => {
  const { dealId, validator } = event.args
  await context.db
    .insert(porepValidatorUpdated)
    .values({ id: eventId(event), dealId, validator, ...eventMeta(event) })
})

ponder.on("PoRepMarket:RailIdUpdated", async ({ event, context }) => {
  const { dealId, railId } = event.args
  await context.db
    .insert(porepRailIdUpdated)
    .values({ id: eventId(event), dealId, railId, ...eventMeta(event) })
})

ponder.on("PoRepMarket:DealCompleted", async ({ event, context }) => {
  const { dealId, client, actualSizeBytes, provider } = event.args
  await context.db
    .insert(porepDealCompleted)
    .values({ id: eventId(event), dealId, client, actualSizeBytes, providerId: provider, ...eventMeta(event) })
})

ponder.on("PoRepMarket:DealTerminated", async ({ event, context }) => {
  const { dealId, terminator, endEpoch } = event.args
  await context.db
    .insert(porepDealTerminated)
    .values({ id: eventId(event), dealId, terminator, endEpoch, ...eventMeta(event) })
})

ponder.on("PoRepMarket:DealRejected", async ({ event, context }) => {
  const { dealId, rejector } = event.args
  await context.db
    .insert(porepDealRejected)
    .values({ id: eventId(event), dealId, rejector, ...eventMeta(event) })
})

ponder.on("PoRepMarket:DealProposalExpired", async ({ event, context }) => {
  const { dealId, expiredAtBlock } = event.args
  await context.db
    .insert(porepDealProposalExpired)
    .values({ id: eventId(event), dealId, expiredAtBlock, ...eventMeta(event) })
})

// -- ValidatorFactory: per-deal operator discovery --

ponder.on("PoRepValidatorFactory:ProxyCreated", async ({ event, context }) => {
  const { proxy, dealId } = event.args
  await context.db
    .insert(porepProxyCreated)
    .values({ id: eventId(event), proxy, dealId, ...eventMeta(event) })
})

// -- PoRep SP registry (separate from FOC ServiceProviderRegistry) --

ponder.on("PoRepSPRegistry:ProviderRegistered", async ({ event, context }) => {
  const { provider, organization } = event.args
  await context.db
    .insert(porepSpRegistered)
    .values({ id: eventId(event), providerId: provider, organization, ...eventMeta(event) })
})

ponder.on("PoRepSPRegistry:PayeeUpdated", async ({ event, context }) => {
  const { provider, oldPayee, newPayee } = event.args
  await context.db
    .insert(porepSpPayeeUpdated)
    .values({ id: eventId(event), providerId: provider, oldPayee, newPayee, ...eventMeta(event) })
})

ponder.on("PoRepSPRegistry:PriceUpdated", async ({ event, context }) => {
  const { provider, oldPrice, newPrice } = event.args
  await context.db
    .insert(porepSpPriceUpdated)
    .values({ id: eventId(event), providerId: provider, oldPrice, newPrice, ...eventMeta(event) })
})

ponder.on("PoRepSPRegistry:CapabilitiesUpdated", async ({ event, context }) => {
  const { provider, capabilities } = event.args
  await context.db
    .insert(porepSpCapabilitiesUpdated)
    .values({ id: eventId(event), providerId: provider, ...sliColumns(capabilities), ...eventMeta(event) })
})

// -- SLIOracle: provider attestations used during settlement --

ponder.on("PoRepSLIOracle:SLIAttestationUpdate", async ({ event, context }) => {
  const { provider, lastUpdate, slis } = event.args
  await context.db
    .insert(porepSliAttestationUpdate)
    .values({ id: eventId(event), providerId: provider, lastUpdate, ...sliColumns(slis), ...eventMeta(event) })
})
