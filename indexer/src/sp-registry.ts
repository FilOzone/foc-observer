import { ponder } from "ponder:registry"
import {
  sprProviderRegistered,
  sprProductAdded,
  sprProductUpdated,
  sprProviderRemoved,
  sprProviderInfoUpdated,
  sprProductRemoved,
  contractUpgraded,
  upgradeAnnounced,
  ownershipTransferred,
} from "ponder:schema"
import { eventId, eventMeta } from "./event-utils.js"

/** Decode a hex bytes value to UTF-8 string, falling back to hex if not valid UTF-8. */
function decodeCapabilityValue(hex: `0x${string}`): string {
  try {
    const bytes = Buffer.from(hex.slice(2), "hex")
    const str = bytes.toString("utf-8")
    // Check for replacement characters (invalid UTF-8 sequences)
    if (str.includes("\ufffd")) return hex
    return str
  } catch {
    return hex
  }
}

function encodeCapabilities(keys: readonly string[] | undefined, values: readonly `0x${string}`[] | undefined): string | null {
  if (!keys?.length) return null
  const map: Record<string, string> = {}
  for (let i = 0; i < keys.length; i++) {
    map[keys[i]] = values?.[i] ? decodeCapabilityValue(values[i]) : ""
  }
  return JSON.stringify(map)
}

ponder.on("SPRegistry:ProviderRegistered", async ({ event, context }) => {
  const { providerId, serviceProvider, payee } = event.args
  await context.db
    .insert(sprProviderRegistered)
    .values({ id: eventId(event), providerId, serviceProvider, payee, ...eventMeta(event) })
})

ponder.on("SPRegistry:ProductAdded", async ({ event, context }) => {
  const { providerId, productType, serviceProvider, capabilityKeys, capabilityValues } = event.args
  await context.db
    .insert(sprProductAdded)
    .values({
      id: eventId(event), providerId, productType, serviceProvider,
      capabilities: encodeCapabilities(capabilityKeys, capabilityValues),
      ...eventMeta(event),
    })
})

ponder.on("SPRegistry:ProductUpdated", async ({ event, context }) => {
  const { providerId, productType, serviceProvider, capabilityKeys, capabilityValues } = event.args
  await context.db
    .insert(sprProductUpdated)
    .values({
      id: eventId(event), providerId, productType, serviceProvider,
      capabilities: encodeCapabilities(capabilityKeys, capabilityValues),
      ...eventMeta(event),
    })
})

ponder.on("SPRegistry:ProviderRemoved", async ({ event, context }) => {
  const { providerId } = event.args
  await context.db
    .insert(sprProviderRemoved)
    .values({ id: eventId(event), providerId, ...eventMeta(event) })
})

ponder.on("SPRegistry:ProviderInfoUpdated", async ({ event, context }) => {
  const { providerId } = event.args
  await context.db
    .insert(sprProviderInfoUpdated)
    .values({ id: eventId(event), providerId, ...eventMeta(event) })
})

ponder.on("SPRegistry:ProductRemoved", async ({ event, context }) => {
  const { providerId, productType } = event.args
  await context.db
    .insert(sprProductRemoved)
    .values({ id: eventId(event), providerId, productType, ...eventMeta(event) })
})

ponder.on("SPRegistry:ContractUpgraded", async ({ event, context }) => {
  const { version, implementation } = event.args
  await context.db
    .insert(contractUpgraded)
    .values({ id: eventId(event), contract: "SPRegistry", version, implementation, ...eventMeta(event) })
})

ponder.on("SPRegistry:UpgradeAnnounced", async ({ event, context }) => {
  const { nextImplementation, afterEpoch } = event.args.plannedUpgrade
  await context.db
    .insert(upgradeAnnounced)
    .values({ id: eventId(event), contract: "SPRegistry", nextImplementation, afterEpoch, ...eventMeta(event) })
})

ponder.on("SPRegistry:OwnershipTransferred", async ({ event, context }) => {
  const { previousOwner, newOwner } = event.args
  await context.db
    .insert(ownershipTransferred)
    .values({ id: eventId(event), contract: "SPRegistry", previousOwner, newOwner, ...eventMeta(event) })
})
