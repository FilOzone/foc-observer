import { ponder } from "ponder:registry"
import { skrAuthorizationsUpdated } from "ponder:schema"
import { eventId, eventMeta } from "./event-utils.js"

ponder.on("SessionKeyRegistry:AuthorizationsUpdated", async ({ event, context }) => {
  const { identity, signer, expiry, permissions: perms, origin } = event.args
  const permissions = perms?.length ? JSON.stringify(perms) : null
  await context.db
    .insert(skrAuthorizationsUpdated)
    .values({ id: eventId(event), identity, signer, expiry, permissions, origin, ...eventMeta(event) })
})
