import { ponder } from "ponder:registry"
import {
  fpRailCreated,
  fpRailSettled,
  fpRailTerminated,
  fpRailFinalized,
  fpDeposit,
  fpWithdrawal,
  fpRailRateModified,
  fpOperatorApproval,
  fpOneTimePayment,
  fpAccountLockupSettled,
  fpRailLockupModified,
} from "ponder:schema"
import { eventId, eventMeta } from "./event-utils.js"

ponder.on("FilecoinPay:RailCreated", async ({ event, context }) => {
  const { railId, payer, payee, token, operator, validator, serviceFeeRecipient, commissionRateBps } = event.args
  await context.db
    .insert(fpRailCreated)
    .values({ id: eventId(event), railId, payer, payee, token, operator, validator, serviceFeeRecipient, commissionRateBps, ...eventMeta(event) })
})

ponder.on("FilecoinPay:RailSettled", async ({ event, context }) => {
  const { railId, totalSettledAmount, totalNetPayeeAmount, operatorCommission, networkFee, settledUpTo } = event.args
  await context.db
    .insert(fpRailSettled)
    .values({
      id: eventId(event),
      railId, totalSettledAmount, totalNetPayeeAmount, operatorCommission, networkFee, settledUpTo,
      ...eventMeta(event),
    })
})

ponder.on("FilecoinPay:RailTerminated", async ({ event, context }) => {
  const { railId, by, endEpoch } = event.args
  await context.db
    .insert(fpRailTerminated)
    .values({ id: eventId(event), railId, by, endEpoch, ...eventMeta(event) })
})

ponder.on("FilecoinPay:RailFinalized", async ({ event, context }) => {
  const { railId } = event.args
  await context.db
    .insert(fpRailFinalized)
    .values({ id: eventId(event), railId, ...eventMeta(event) })
})

ponder.on("FilecoinPay:DepositRecorded", async ({ event, context }) => {
  const { token, from, to, amount } = event.args
  await context.db
    .insert(fpDeposit)
    .values({ id: eventId(event), token, from, to, amount, ...eventMeta(event) })
})

ponder.on("FilecoinPay:WithdrawRecorded", async ({ event, context }) => {
  const { token, from, to, amount } = event.args
  await context.db
    .insert(fpWithdrawal)
    .values({ id: eventId(event), token, from, to, amount, ...eventMeta(event) })
})

ponder.on("FilecoinPay:RailRateModified", async ({ event, context }) => {
  const { railId, oldRate, newRate } = event.args
  await context.db
    .insert(fpRailRateModified)
    .values({ id: eventId(event), railId, oldRate, newRate, ...eventMeta(event) })
})

ponder.on("FilecoinPay:OperatorApprovalUpdated", async ({ event, context }) => {
  const { token, client, operator, approved, rateAllowance, lockupAllowance, maxLockupPeriod } = event.args
  await context.db
    .insert(fpOperatorApproval)
    .values({ id: eventId(event), token, client, operator, approved, rateAllowance, lockupAllowance, maxLockupPeriod, ...eventMeta(event) })
})

ponder.on("FilecoinPay:RailOneTimePaymentProcessed", async ({ event, context }) => {
  const { railId, netPayeeAmount, operatorCommission, networkFee } = event.args
  await context.db
    .insert(fpOneTimePayment)
    .values({ id: eventId(event), railId, netPayeeAmount, operatorCommission, networkFee, ...eventMeta(event) })
})

ponder.on("FilecoinPay:AccountLockupSettled", async ({ event, context }) => {
  const { token, owner, lockupCurrent, lockupRate, lockupLastSettledAt } = event.args
  await context.db
    .insert(fpAccountLockupSettled)
    .values({ id: eventId(event), token, owner, lockupCurrent, lockupRate, lockupLastSettledAt, ...eventMeta(event) })
})

ponder.on("FilecoinPay:RailLockupModified", async ({ event, context }) => {
  const { railId, oldLockupPeriod, newLockupPeriod, oldLockupFixed, newLockupFixed } = event.args
  await context.db
    .insert(fpRailLockupModified)
    .values({
      id: eventId(event), railId,
      oldLockupPeriod, newLockupPeriod, oldLockupFixed, newLockupFixed,
      ...eventMeta(event),
    })
})
