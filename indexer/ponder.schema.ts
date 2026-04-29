/**
 * Ponder schema, generated from src/schema-defs.ts.
 *
 * Do not edit table definitions here. Edit schema-defs.ts instead.
 * This file translates the shared definitions into Ponder's onchainTable() format.
 */

import { onchainTable, index } from "ponder"
import { TABLES, STANDARD_COLUMNS, type ColType } from "./src/schema-defs.js"

// Ponder's column-defn arg is overloaded as `Record | (t) => Record`. We want
// the function form to extract the columns-builder parameter type.
type ColumnsFn = Extract<Parameters<typeof onchainTable>[1], (...args: never[]) => unknown>
type TableBuilder = Parameters<ColumnsFn>[0]

function buildColumn(t: TableBuilder, type: ColType, nullable: boolean) {
  const col = type === "bigint" ? t.bigint()
    : type === "int" ? t.integer()
    : type === "hex" ? t.hex()
    : type === "bool" ? t.boolean()
    : t.text()
  return nullable ? col : col.notNull()
}

function buildTable(name: string) {
  const def = TABLES[name]!
  return onchainTable(name, (t) => {
    const cols: Record<string, ReturnType<typeof buildColumn>> = {}

    // Standard columns
    cols.id = t.text().primaryKey()
    for (const [colName, colDef] of Object.entries(STANDARD_COLUMNS)) {
      if (colName === "id") continue
      cols[colName] = buildColumn(t, colDef.type, colDef.nullable ?? false)
    }

    // Table-specific columns
    for (const [colName, colDef] of Object.entries(def.columns)) {
      cols[colName] = buildColumn(t, colDef.type, colDef.nullable ?? false)
    }

    return cols
  // biome-ignore lint/suspicious/noExplicitAny: dynamic index generation
  }, (table: any) => {
    if (!def.indexes?.length) return {}
    // biome-ignore lint/suspicious/noExplicitAny: dynamic index generation
    const indexes: Record<string, any> = {}
    for (const col of def.indexes) {
      indexes[`${col}Idx`] = index().on(table[col])
    }
    return indexes
  })
}

// Generate all table exports
// biome-ignore lint/suspicious/noExplicitAny: dynamic table generation
const tables: Record<string, any> = {}
for (const name of Object.keys(TABLES)) {
  tables[name] = buildTable(name)
}

// Named exports matching the camelCase convention used by handlers
export const pdpDataSetCreated = tables.pdp_data_set_created
export const pdpNextProvingPeriod = tables.pdp_next_proving_period
export const pdpProofFeePaid = tables.pdp_proof_fee_paid
export const pdpPossessionProven = tables.pdp_possession_proven
export const pdpDataSetDeleted = tables.pdp_data_set_deleted
export const pdpPiecesAdded = tables.pdp_pieces_added
export const pdpPiecesRemoved = tables.pdp_pieces_removed
export const pdpStorageProviderChanged = tables.pdp_storage_provider_changed
export const pdpDataSetEmpty = tables.pdp_data_set_empty
export const pdpFeeUpdateProposed = tables.pdp_fee_update_proposed

export const fwssDataSetCreated = tables.fwss_data_set_created
export const fwssPieceAdded = tables.fwss_piece_added
export const fwssFaultRecord = tables.fwss_fault_record
export const fwssRailRateUpdated = tables.fwss_rail_rate_updated
export const fwssServiceTerminated = tables.fwss_service_terminated
export const fwssPricingUpdated = tables.fwss_pricing_updated
export const fwssProviderApproved = tables.fwss_provider_approved
export const fwssProviderUnapproved = tables.fwss_provider_unapproved
export const fwssDataSetSPChanged = tables.fwss_data_set_sp_changed
export const fwssPdpPaymentTerminated = tables.fwss_pdp_payment_terminated
export const fwssCdnPaymentTerminated = tables.fwss_cdn_payment_terminated
export const fwssCdnServiceTerminated = tables.fwss_cdn_service_terminated
export const fwssCdnRailsToppedUp = tables.fwss_cdn_rails_topped_up

export const contractUpgraded = tables.contract_upgraded
export const upgradeAnnounced = tables.upgrade_announced
export const ownershipTransferred = tables.ownership_transferred
export const fwssServiceDeployed = tables.fwss_service_deployed
export const fwssFilbeamControllerChanged = tables.fwss_filbeam_controller_changed
export const fwssViewContractSet = tables.fwss_view_contract_set

export const fpRailCreated = tables.fp_rail_created
export const fpRailSettled = tables.fp_rail_settled
export const fpRailTerminated = tables.fp_rail_terminated
export const fpRailFinalized = tables.fp_rail_finalized
export const fpDeposit = tables.fp_deposit
export const fpWithdrawal = tables.fp_withdrawal
export const fpRailRateModified = tables.fp_rail_rate_modified
export const fpOperatorApproval = tables.fp_operator_approval
export const fpOneTimePayment = tables.fp_one_time_payment
export const fpAccountLockupSettled = tables.fp_account_lockup_settled
export const fpRailLockupModified = tables.fp_rail_lockup_modified
export const fpBurnForFees = tables.fp_burn_for_fees

export const sprProviderRegistered = tables.spr_provider_registered
export const sprProductAdded = tables.spr_product_added
export const sprProductUpdated = tables.spr_product_updated
export const sprProviderRemoved = tables.spr_provider_removed
export const sprProviderInfoUpdated = tables.spr_provider_info_updated
export const sprProductRemoved = tables.spr_product_removed

export const skrAuthorizationsUpdated = tables.skr_authorizations_updated

// FilBeam (CDN bandwidth ledger)
export const fbUsageReported = tables.fb_usage_reported
export const fbCdnSettlement = tables.fb_cdn_settlement
export const fbCacheMissSettlement = tables.fb_cache_miss_settlement
export const fbPaymentRailsTerminated = tables.fb_payment_rails_terminated
export const fbControllerUpdated = tables.fb_controller_updated
export const fbFwssFilbeamControllerChanged = tables.fb_fwss_filbeam_controller_changed
export const fbOwnershipTransferred = tables.fb_ownership_transferred

// Storacha FWSS (separate listener contract)
export const storachaFwssDataSetCreated = tables.storacha_fwss_data_set_created
export const storachaFwssPieceAdded = tables.storacha_fwss_piece_added
export const storachaFwssFaultRecord = tables.storacha_fwss_fault_record
export const storachaFwssRailRateUpdated = tables.storacha_fwss_rail_rate_updated
export const storachaFwssServiceTerminated = tables.storacha_fwss_service_terminated
export const storachaFwssPricingUpdated = tables.storacha_fwss_pricing_updated
export const storachaFwssProviderApproved = tables.storacha_fwss_provider_approved
export const storachaFwssProviderUnapproved = tables.storacha_fwss_provider_unapproved
export const storachaFwssDataSetSpChanged = tables.storacha_fwss_data_set_sp_changed
export const storachaFwssPdpPaymentTerminated = tables.storacha_fwss_pdp_payment_terminated
export const storachaFwssCdnPaymentTerminated = tables.storacha_fwss_cdn_payment_terminated
export const storachaFwssCdnServiceTerminated = tables.storacha_fwss_cdn_service_terminated
export const storachaFwssCdnRailsToppedUp = tables.storacha_fwss_cdn_rails_topped_up
export const storachaFwssContractUpgraded = tables.storacha_fwss_contract_upgraded
export const storachaFwssUpgradeAnnounced = tables.storacha_fwss_upgrade_announced
export const storachaFwssOwnershipTransferred = tables.storacha_fwss_ownership_transferred
export const storachaFwssServiceDeployed = tables.storacha_fwss_service_deployed
export const storachaFwssFilbeamControllerChanged = tables.storacha_fwss_filbeam_controller_changed
export const storachaFwssViewContractSet = tables.storacha_fwss_view_contract_set
