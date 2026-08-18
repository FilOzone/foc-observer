/**
 * FOC Observer table definitions: the single source of truth.
 *
 * Consumed by:
 * - ponder.schema.ts: generates Ponder onchainTable() calls
 * - shared/table-metadata.ts: generates agent context descriptions
 *
 * No Ponder-specific imports here. Plain data only.
 */

export type ColType = "bigint" | "int" | "text" | "hex" | "bool"

export interface ColDef {
  type: ColType
  nullable?: boolean
  note?: string
}

export interface TableDef {
  description: string
  /** Non-standard columns (standard tx/block metadata added automatically) */
  columns: Record<string, ColDef>
  /** Column names to index (in addition to automatic indexes on standard fields) */
  indexes?: string[]
}

// tx_from, tx_value, gas_used, effective_gas_price live in public.tx_meta
// (backed by ponder_sync). Join via tx_hash.
export const STANDARD_COLUMNS: Record<string, ColDef> = {
  id: { type: "text", note: "blockHash-logIndex" },
  txHash: { type: "hex", note: "join key for tx_meta" },
  blockNumber: { type: "bigint", note: "epoch" },
  timestamp: { type: "bigint", note: "unix seconds" },
}

export const TABLES: Record<string, TableDef> = {
  // -- PDPVerifier --
  pdp_data_set_created: {
    description: "Dataset creation in PDPVerifier",
    columns: {
      setId: { type: "bigint" },
      storageProvider: { type: "hex" },
    },
    indexes: ["setId", "storageProvider"],
  },
  pdp_next_proving_period: {
    description: "Proving period advancement",
    columns: {
      setId: { type: "bigint" },
      challengeEpoch: { type: "bigint" },
      leafCount: { type: "bigint" },
    },
    indexes: ["setId", "blockNumber"],
  },
  pdp_proof_fee_paid: {
    description: "FIL proof fee paid on dataset creation",
    columns: {
      setId: { type: "bigint" },
      fee: { type: "bigint", note: "FIL, 18 dec" },
    },
    indexes: ["setId", "blockNumber"],
  },
  pdp_possession_proven: {
    description: "Proof submission with challenge details",
    columns: {
      setId: { type: "bigint" },
      challengeCount: { type: "int", nullable: true },
      challenges: { type: "text", nullable: true, note: "JSON [{pieceId: int, offset: string}]" },
    },
    indexes: ["setId", "blockNumber"],
  },
  pdp_data_set_deleted: {
    description: "Dataset deletion",
    columns: {
      setId: { type: "bigint" },
      deletedLeafCount: { type: "bigint" },
    },
    indexes: ["setId"],
  },
  pdp_pieces_added: {
    description: "Pieces added to dataset with CIDs and sizes",
    columns: {
      setId: { type: "bigint" },
      pieceCount: { type: "int" },
      pieces: { type: "text", nullable: true, note: "JSON [{id: int, cid: string, size: string}]" },
    },
    indexes: ["setId"],
  },
  pdp_pieces_removed: {
    description: "Pieces removed from dataset",
    columns: {
      setId: { type: "bigint" },
      pieceCount: { type: "int" },
      pieceIds: { type: "text", nullable: true, note: "JSON [int]" },
    },
    indexes: ["setId", "blockNumber"],
  },
  pdp_storage_provider_changed: {
    description: "Dataset transferred to new SP",
    columns: {
      setId: { type: "bigint" },
      oldStorageProvider: { type: "hex" },
      newStorageProvider: { type: "hex" },
    },
    indexes: ["setId"],
  },
  pdp_data_set_empty: {
    description: "All pieces removed from dataset",
    columns: {
      setId: { type: "bigint" },
    },
    indexes: ["setId"],
  },
  pdp_fee_update_proposed: {
    description: "Proof fee change proposal",
    columns: {
      currentFee: { type: "bigint" },
      newFee: { type: "bigint" },
      effectiveTime: { type: "bigint" },
    },
  },

  // -- FWSS --
  fwss_data_set_created: {
    description: "FWSS dataset creation with rails and metadata",
    columns: {
      dataSetId: { type: "bigint" },
      providerId: { type: "bigint" },
      pdpRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      payer: { type: "hex" },
      serviceProvider: { type: "hex" },
      payee: { type: "hex" },
      source: { type: "text", nullable: true, note: "creating app e.g. 'dealbot'" },
      withCDN: { type: "bool" },
      metadata: { type: "text", nullable: true, note: "JSON key-value pairs" },
    },
    indexes: ["dataSetId", "providerId", "payer", "serviceProvider", "payee", "pdpRailId", "source", "blockNumber"],
  },
  fwss_piece_added: {
    description: "Piece added to FWSS dataset",
    columns: {
      dataSetId: { type: "bigint" },
      pieceId: { type: "bigint" },
      pieceCid: { type: "text", note: "CID string e.g. baga6ea4seaq..." },
      rawSize: { type: "bigint", note: "bytes, from PieceCIDv2" },
      metadata: { type: "text", nullable: true, note: "JSON key-value pairs" },
    },
    indexes: ["dataSetId", "pieceId", "pieceCid", "blockNumber"],
  },
  fwss_fault_record: {
    description: "Proving fault, SP missed deadline",
    columns: {
      dataSetId: { type: "bigint" },
      periodsFaulted: { type: "bigint", note: "consecutive misses" },
      deadline: { type: "bigint", note: "epoch" },
    },
    indexes: ["dataSetId", "blockNumber"],
  },
  fwss_rail_rate_updated: {
    description: "Payment rate change on dataset rail",
    columns: {
      dataSetId: { type: "bigint" },
      railId: { type: "bigint" },
      newRate: { type: "bigint", note: "USDFC/epoch, 18 dec" },
    },
    indexes: ["dataSetId", "railId", "blockNumber"],
  },
  fwss_service_terminated: {
    description: "Service termination via terminateService. approver is the EIP-712 authorizer (payer, payer's session key, or SP); not necessarily tx.from. Mutual termination (payer signs, SP submits) is indistinguishable from payer-initiated here.",
    columns: {
      approver: { type: "hex", note: "EIP-712 authorizer (payer / session key / SP); pre-v1.3.0 was always tx sender" },
      dataSetId: { type: "bigint" },
      pdpRailId: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
    },
    indexes: ["dataSetId", "pdpRailId", "approver", "blockNumber"],
  },
  fwss_data_set_abandoned: {
    description: "Dataset reaped via abandonment path: third party called PDPVerifier.deleteDataSet after PDP_INACTIVITY_WINDOW elapsed with no terminateService. Lifecycle endpoint distinct from ServiceTerminated. v1.3.0+.",
    columns: {
      dataSetId: { type: "bigint" },
      pdpRailId: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
    },
    indexes: ["dataSetId", "pdpRailId"],
  },
  fwss_pricing_updated: {
    description: "Legacy v1.2.x event: global storage pricing change. Removed in v1.3.0 (pricing is now per-dataset, locked at create-time). No new rows once a deployment upgrades past v1.2.x.",
    columns: {
      storagePrice: { type: "bigint", note: "USDFC/TiB/month, 18 dec" },
      minimumRate: { type: "bigint", note: "USDFC/epoch, 18 dec" },
    },
  },
  fwss_provider_approved: {
    description: "Provider approved for FWSS storage",
    columns: { providerId: { type: "bigint" } },
    indexes: ["providerId"],
  },
  fwss_provider_unapproved: {
    description: "Provider approval revoked",
    columns: { providerId: { type: "bigint" } },
    indexes: ["providerId"],
  },
  fwss_data_set_sp_changed: {
    description: "Dataset migrated to different SP",
    columns: {
      dataSetId: { type: "bigint" },
      oldServiceProvider: { type: "hex" },
      newServiceProvider: { type: "hex" },
    },
    indexes: ["dataSetId"],
  },
  fwss_pdp_payment_terminated: {
    description: "PDP storage payment rail terminated",
    columns: {
      dataSetId: { type: "bigint" },
      endEpoch: { type: "bigint" },
      pdpRailId: { type: "bigint" },
    },
    indexes: ["dataSetId"],
  },
  fwss_cdn_payment_terminated: {
    description: "CDN payment rails terminated",
    columns: {
      dataSetId: { type: "bigint" },
      endEpoch: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
    },
    indexes: ["dataSetId"],
  },
  fwss_cdn_service_terminated: {
    description: "CDN service fully terminated",
    columns: {
      caller: { type: "hex" },
      dataSetId: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
    },
    indexes: ["dataSetId"],
  },
  fwss_cdn_rails_topped_up: {
    description: "CDN lockup funds added",
    columns: {
      dataSetId: { type: "bigint" },
      cdnAmountAdded: { type: "bigint" },
      totalCdnLockup: { type: "bigint" },
      cacheMissAmountAdded: { type: "bigint" },
      totalCacheMissLockup: { type: "bigint" },
    },
    indexes: ["dataSetId"],
  },

  // -- Contract lifecycle --
  contract_upgraded: {
    description: "Contract implementation upgrade",
    columns: {
      contract: { type: "text", note: "PDPVerifier|FWSS|SPRegistry" },
      version: { type: "text" },
      implementation: { type: "hex" },
    },
    indexes: ["contract", "blockNumber"],
  },
  upgrade_announced: {
    description: "Timelock upgrade announcement (before execution)",
    columns: {
      contract: { type: "text", note: "PDPVerifier|FWSS|SPRegistry" },
      nextImplementation: { type: "hex" },
      afterEpoch: { type: "bigint", note: "epoch after which upgrade can execute" },
    },
    indexes: ["contract"],
  },
  ownership_transferred: {
    description: "Contract ownership change (security-relevant)",
    columns: {
      contract: { type: "text", note: "PDPVerifier|FWSS|SPRegistry" },
      previousOwner: { type: "hex" },
      newOwner: { type: "hex" },
    },
    indexes: ["contract", "newOwner"],
  },
  fwss_service_deployed: {
    description: "FWSS service deployment (fires once at initialization)",
    columns: {
      name: { type: "text" },
      description: { type: "text" },
    },
  },
  fwss_filbeam_controller_changed: {
    description: "FilBeam CDN controller address change",
    columns: {
      oldController: { type: "hex" },
      newController: { type: "hex" },
    },
  },
  fwss_view_contract_set: {
    description: "FWSS view contract address change",
    columns: {
      viewContract: { type: "hex" },
    },
  },

  // -- FilecoinPay --
  fp_rail_created: {
    description: "Payment rail creation",
    columns: {
      railId: { type: "bigint" },
      payer: { type: "hex" },
      payee: { type: "hex" },
      token: { type: "hex" },
      operator: { type: "hex" },
      validator: { type: "hex" },
      serviceFeeRecipient: { type: "hex" },
      commissionRateBps: { type: "bigint", note: "basis points" },
    },
    indexes: ["railId", "payer", "payee", "token", "operator", "blockNumber"],
  },
  fp_rail_settled: {
    description: "Settlement (amounts INCREMENTAL per event, SUM for totals)",
    columns: {
      railId: { type: "bigint" },
      totalSettledAmount: { type: "bigint", note: "gross this event" },
      totalNetPayeeAmount: { type: "bigint", note: "to SP this event" },
      operatorCommission: { type: "bigint" },
      networkFee: { type: "bigint" },
      settledUpTo: { type: "bigint", note: "epoch, cumulative" },
    },
    indexes: ["railId", "blockNumber"],
  },
  fp_rail_terminated: {
    description: "Rail terminated",
    columns: {
      railId: { type: "bigint" },
      by: { type: "hex" },
      endEpoch: { type: "bigint" },
    },
    indexes: ["railId", "blockNumber"],
  },
  fp_rail_finalized: {
    description: "Rail fully settled and zeroed",
    columns: { railId: { type: "bigint" } },
    indexes: ["railId"],
  },
  fp_deposit: {
    description: "Token deposit into FilecoinPay account",
    columns: {
      token: { type: "hex" },
      from: { type: "hex" },
      to: { type: "hex" },
      amount: { type: "bigint", note: "18 dec" },
    },
    indexes: ["to", "from", "blockNumber"],
  },
  fp_withdrawal: {
    description: "Token withdrawal",
    columns: {
      token: { type: "hex" },
      from: { type: "hex" },
      to: { type: "hex" },
      amount: { type: "bigint", note: "18 dec" },
    },
    indexes: ["from", "blockNumber"],
  },
  fp_rail_rate_modified: {
    description: "Payment rate change on rail",
    columns: {
      railId: { type: "bigint" },
      oldRate: { type: "bigint" },
      newRate: { type: "bigint" },
    },
    indexes: ["railId", "blockNumber"],
  },
  fp_operator_approval: {
    description: "Operator approval granted/revoked",
    columns: {
      token: { type: "hex" },
      client: { type: "hex" },
      operator: { type: "hex" },
      approved: { type: "bool" },
      rateAllowance: { type: "bigint", note: "max rate operator can set" },
      lockupAllowance: { type: "bigint", note: "max lockup operator can set" },
      maxLockupPeriod: { type: "bigint", note: "max lockup period in epochs" },
    },
    indexes: ["client", "operator"],
  },
  fp_one_time_payment: {
    description: "One-time payment (CDN usage, sybil fees)",
    columns: {
      railId: { type: "bigint" },
      netPayeeAmount: { type: "bigint" },
      operatorCommission: { type: "bigint" },
      networkFee: { type: "bigint" },
    },
    indexes: ["railId"],
  },
  fp_account_lockup_settled: {
    description: "Account lockup state updated",
    columns: {
      token: { type: "hex" },
      owner: { type: "hex" },
      lockupCurrent: { type: "bigint" },
      lockupRate: { type: "bigint" },
      lockupLastSettledAt: { type: "bigint" },
    },
    indexes: ["owner"],
  },
  fp_rail_lockup_modified: {
    description: "Rail lockup parameters changed",
    columns: {
      railId: { type: "bigint" },
      oldLockupPeriod: { type: "bigint" },
      newLockupPeriod: { type: "bigint" },
      oldLockupFixed: { type: "bigint" },
      newLockupFixed: { type: "bigint" },
    },
    indexes: ["railId"],
  },
  fp_burn_for_fees: {
    description: "FIL burned via fee auction. No event - row exists because the tx called burnForFees on FilecoinPay. requestedAmount comes from decoded input (USDFC claimed). For the FIL burned and the caller, JOIN tx_meta USING (tx_hash): tx_meta.tx_value is the FIL sent (= burned), tx_meta.tx_from is the caller.",
    columns: {
      token: { type: "hex" },
      recipient: { type: "hex" },
      requestedAmount: { type: "bigint" },
    },
    indexes: ["token", "blockNumber"],
  },

  // -- ServiceProviderRegistry --
  spr_provider_registered: {
    description: "New SP registered",
    columns: {
      providerId: { type: "bigint" },
      serviceProvider: { type: "hex" },
      payee: { type: "hex" },
    },
    indexes: ["providerId", "serviceProvider"],
  },
  spr_product_added: {
    description: "Product type added to SP",
    columns: {
      providerId: { type: "bigint" },
      productType: { type: "int" },
      serviceProvider: { type: "hex" },
      capabilities: { type: "text", nullable: true, note: "JSON key-value pairs" },
    },
    indexes: ["providerId"],
  },
  spr_product_updated: {
    description: "Product listing updated",
    columns: {
      providerId: { type: "bigint" },
      productType: { type: "int" },
      serviceProvider: { type: "hex" },
      capabilities: { type: "text", nullable: true, note: "JSON key-value pairs" },
    },
    indexes: ["providerId"],
  },
  spr_provider_removed: {
    description: "SP deregistered",
    columns: { providerId: { type: "bigint" } },
    indexes: ["providerId"],
  },
  spr_provider_info_updated: {
    description: "SP name/description changed",
    columns: { providerId: { type: "bigint" } },
    indexes: ["providerId"],
  },
  spr_product_removed: {
    description: "Product type removed from SP",
    columns: {
      providerId: { type: "bigint" },
      productType: { type: "int" },
    },
    indexes: ["providerId"],
  },

  // -- SessionKeyRegistry --
  skr_authorizations_updated: {
    description: "Session key authorization changed",
    columns: {
      identity: { type: "hex" },
      signer: { type: "hex" },
      expiry: { type: "bigint" },
      permissions: { type: "text", nullable: true, note: "JSON array of bytes32 permission hashes" },
      origin: { type: "text" },
    },
    indexes: ["identity", "signer"],
  },

  // -- FilBeam (CDN bandwidth ledger) --
  fb_usage_reported: {
    description: "FilBeam off-chain CDN/cache-miss bandwidth rollup, joins to fwss_data_set_created via data_set_id. cdn_bytes_used is TOTAL egress (hits+misses), cache_miss_bytes_used is a SUBSET (origin fetches only)",
    columns: {
      operator: { type: "hex", note: "FilBeamOperator contract address (multiple deployments over time)" },
      dataSetId: { type: "bigint" },
      fromEpoch: { type: "bigint" },
      toEpoch: { type: "bigint" },
      cdnBytesUsed: { type: "bigint", note: "TOTAL egress bytes including cache misses; cache_hit_ratio = 1 - (cache_miss / cdn)" },
      cacheMissBytesUsed: { type: "bigint", note: "SUBSET of cdn_bytes_used; bytes that required origin fetch from SP" },
    },
    indexes: ["dataSetId", "operator", "blockNumber"],
  },
  fb_cdn_settlement: {
    description: "CDN payment rail settled by FilBeam (joins to fwss_data_set_created.cdn_rail_id)",
    columns: {
      operator: { type: "hex" },
      dataSetId: { type: "bigint" },
      cdnAmount: { type: "bigint", note: "USDFC settled in this event, capped to rail lockupFixed" },
    },
    indexes: ["dataSetId", "operator", "blockNumber"],
  },
  fb_cache_miss_settlement: {
    description: "Cache-miss payment rail settled by FilBeam (joins to fwss_data_set_created.cache_miss_rail_id)",
    columns: {
      operator: { type: "hex" },
      dataSetId: { type: "bigint" },
      cacheMissAmount: { type: "bigint", note: "USDFC settled in this event, capped to rail lockupFixed" },
    },
    indexes: ["dataSetId", "operator", "blockNumber"],
  },
  fb_payment_rails_terminated: {
    description: "FilBeam-initiated CDN service termination, calls FWSS.terminateCDNService",
    columns: {
      operator: { type: "hex" },
      dataSetId: { type: "bigint" },
    },
    indexes: ["dataSetId", "operator"],
  },
  fb_controller_updated: {
    description: "FilBeamOperator's authorized controller address changed (off-chain reporter)",
    columns: {
      operator: { type: "hex" },
      oldController: { type: "hex" },
      newController: { type: "hex" },
    },
    indexes: ["operator"],
  },
  fb_fwss_filbeam_controller_changed: {
    description: "FilBeamOperator transferred FWSS-side controller authorization to a new operator instance (upgrade handover)",
    columns: {
      operator: { type: "hex", note: "the contract emitting (the previous instance)" },
      previousController: { type: "hex" },
      newController: { type: "hex" },
    },
    indexes: ["operator"],
  },
  fb_ownership_transferred: {
    description: "FilBeamOperator contract owner changed (security-relevant; controls who can update the controller)",
    columns: {
      operator: { type: "hex" },
      previousOwner: { type: "hex" },
      newOwner: { type: "hex" },
    },
    indexes: ["operator", "newOwner"],
  },

  // -- Storacha FWSS (separate listener contract on shared PDPVerifier and FilecoinPay) --
  // Tables mirror fwss_* but track Storacha's own service contract events.
  // Storacha datasets share pdp_* and fp_* tables; only the FWSS-listener-level events are separate.
  storacha_fwss_data_set_created: {
    description: "Storacha FWSS dataset creation with rails and metadata",
    columns: {
      dataSetId: { type: "bigint" },
      providerId: { type: "bigint" },
      pdpRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      payer: { type: "hex" },
      serviceProvider: { type: "hex" },
      payee: { type: "hex" },
      source: { type: "text", nullable: true },
      withCDN: { type: "bool" },
      metadata: { type: "text", nullable: true, note: "JSON key-value pairs" },
    },
    indexes: ["dataSetId", "providerId", "payer", "serviceProvider", "payee", "pdpRailId", "source", "blockNumber"],
  },
  storacha_fwss_piece_added: {
    description: "Piece added to Storacha FWSS dataset",
    columns: {
      dataSetId: { type: "bigint" },
      pieceId: { type: "bigint" },
      pieceCid: { type: "text", note: "CID string e.g. baga6ea4seaq..." },
      rawSize: { type: "bigint", note: "bytes, from PieceCIDv2" },
      metadata: { type: "text", nullable: true, note: "JSON key-value pairs" },
    },
    indexes: ["dataSetId", "pieceId", "pieceCid", "blockNumber"],
  },
  storacha_fwss_fault_record: {
    description: "Storacha FWSS proving fault, SP missed deadline",
    columns: {
      dataSetId: { type: "bigint" },
      periodsFaulted: { type: "bigint", note: "consecutive misses" },
      deadline: { type: "bigint", note: "epoch" },
    },
    indexes: ["dataSetId", "blockNumber"],
  },
  storacha_fwss_rail_rate_updated: {
    description: "Storacha FWSS payment rate change on dataset rail",
    columns: {
      dataSetId: { type: "bigint" },
      railId: { type: "bigint" },
      newRate: { type: "bigint", note: "USDFC/epoch, 18 dec" },
    },
    indexes: ["dataSetId", "railId", "blockNumber"],
  },
  storacha_fwss_service_terminated: {
    description: "Storacha FWSS full service termination. Storacha tracks v1.2.x (caller = tx sender), no v1.3.0 approver semantics.",
    columns: {
      caller: { type: "hex" },
      dataSetId: { type: "bigint" },
      pdpRailId: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
    },
    indexes: ["dataSetId", "pdpRailId", "caller", "blockNumber"],
  },
  storacha_fwss_pricing_updated: {
    description: "Storacha FWSS global storage pricing change. Storacha tracks v1.2.x where PricingUpdated is still active.",
    columns: {
      storagePrice: { type: "bigint", note: "USDFC/TiB/month, 18 dec" },
      minimumRate: { type: "bigint", note: "USDFC/epoch, 18 dec" },
    },
  },
  storacha_fwss_provider_approved: {
    description: "Provider approved for Storacha FWSS storage",
    columns: { providerId: { type: "bigint" } },
    indexes: ["providerId"],
  },
  storacha_fwss_provider_unapproved: {
    description: "Provider approval revoked from Storacha FWSS",
    columns: { providerId: { type: "bigint" } },
    indexes: ["providerId"],
  },
  storacha_fwss_data_set_sp_changed: {
    description: "Storacha FWSS dataset migrated to different SP (note: Storacha reverts SP changes, expect zero rows)",
    columns: {
      dataSetId: { type: "bigint" },
      oldServiceProvider: { type: "hex" },
      newServiceProvider: { type: "hex" },
    },
    indexes: ["dataSetId"],
  },
  storacha_fwss_pdp_payment_terminated: {
    description: "Storacha FWSS PDP storage payment rail terminated",
    columns: {
      dataSetId: { type: "bigint" },
      endEpoch: { type: "bigint" },
      pdpRailId: { type: "bigint" },
    },
    indexes: ["dataSetId"],
  },
  storacha_fwss_cdn_payment_terminated: {
    description: "Storacha FWSS CDN payment rails terminated",
    columns: {
      dataSetId: { type: "bigint" },
      endEpoch: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
    },
    indexes: ["dataSetId"],
  },
  storacha_fwss_cdn_service_terminated: {
    description: "Storacha FWSS CDN service fully terminated",
    columns: {
      caller: { type: "hex" },
      dataSetId: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
    },
    indexes: ["dataSetId"],
  },
  storacha_fwss_cdn_rails_topped_up: {
    description: "Storacha FWSS CDN lockup funds added",
    columns: {
      dataSetId: { type: "bigint" },
      cdnAmountAdded: { type: "bigint" },
      totalCdnLockup: { type: "bigint" },
      cacheMissAmountAdded: { type: "bigint" },
      totalCacheMissLockup: { type: "bigint" },
    },
    indexes: ["dataSetId"],
  },
  storacha_fwss_contract_upgraded: {
    description: "Storacha FWSS contract implementation upgrade",
    columns: {
      version: { type: "text" },
      implementation: { type: "hex" },
    },
    indexes: ["blockNumber"],
  },
  storacha_fwss_upgrade_announced: {
    description: "Storacha FWSS timelock upgrade announcement",
    columns: {
      nextImplementation: { type: "hex" },
      afterEpoch: { type: "bigint" },
    },
  },
  storacha_fwss_ownership_transferred: {
    description: "Storacha FWSS contract ownership change",
    columns: {
      previousOwner: { type: "hex" },
      newOwner: { type: "hex" },
    },
    indexes: ["newOwner"],
  },
  storacha_fwss_service_deployed: {
    description: "Storacha FWSS service deployment marker (fires once at initialization)",
    columns: {
      name: { type: "text" },
      description: { type: "text" },
    },
  },
  storacha_fwss_filbeam_controller_changed: {
    description: "Storacha FWSS FilBeam CDN controller address change (likely unused, Storacha has its own infrastructure)",
    columns: {
      oldController: { type: "hex" },
      newController: { type: "hex" },
    },
  },
  storacha_fwss_view_contract_set: {
    description: "Storacha FWSS view contract address change",
    columns: {
      viewContract: { type: "hex" },
    },
  },

  // -- PoRep Market (fidlabs cold-storage market on shared FilecoinPay) --
  // A separate service with its own SP registry, DataCap+SLI proof, and
  // one per-deal Validator contract as the FilecoinPay operator. These tables
  // track mainnet V1 events. Bridge to payment data via porep_rail_id_updated.
  porep_deal_proposal_created: {
    description: "PoRep Market deal proposed. client = payer, providerId = SP Filecoin actor id (uint64), the four SLI columns are the deal's required thresholds, manifestHash = content id, totalDealSize in bytes. Price is recorded in porep_sp_price_updated. Bridge to the payment rail via porep_rail_id_updated.rail_id -> fp_rail_created.rail_id.",
    columns: {
      dealId: { type: "bigint" },
      client: { type: "hex", note: "payer address" },
      providerId: { type: "bigint", note: "SP Filecoin actor id" },
      retrievabilityBps: { type: "int", note: "required SLI: retrievability, basis points" },
      bandwidthMbps: { type: "int", note: "required SLI: bandwidth, Mbps" },
      latencyMs: { type: "int", note: "required SLI: latency, ms" },
      indexingPct: { type: "int", note: "required SLI: indexing, percent" },
      manifestLocation: { type: "text" },
      manifestHash: { type: "hex", note: "bytes32 content-addressed deal data hash" },
      totalDealSize: { type: "bigint", note: "bytes" },
      proposedAtBlock: { type: "bigint" },
    },
    indexes: ["dealId", "client", "providerId", "blockNumber"],
  },
  porep_deal_accepted: {
    description: "PoRep Market deal accepted by the SP (Proposed -> Accepted)",
    columns: {
      dealId: { type: "bigint" },
      owner: { type: "hex" },
      providerId: { type: "bigint", note: "SP Filecoin actor id" },
    },
    indexes: ["dealId", "providerId"],
  },
  porep_validator_updated: {
    description: "PoRep deal's per-deal Validator (FilecoinPay operator) contract set. validator = fp_rail_created.operator. Redundant with porep_proxy_created but keyed by dealId.",
    columns: {
      dealId: { type: "bigint" },
      validator: { type: "hex" },
    },
    indexes: ["dealId", "validator"],
  },
  porep_rail_id_updated: {
    description: "Links a PoRep deal to its FilecoinPay rail. Primary bridge: railId joins fp_rail_created / fp_rail_settled; dealId joins the porep_deal_* tables. Lets fp_* revenue/settlement analytics attribute to PoRep deals, clients, and SPs.",
    columns: {
      dealId: { type: "bigint" },
      railId: { type: "bigint" },
    },
    indexes: ["dealId", "railId", "blockNumber"],
  },
  porep_deal_completed: {
    description: "PoRep Market deal completed (Accepted -> Completed). actualSizeBytes = realized stored size.",
    columns: {
      dealId: { type: "bigint" },
      client: { type: "hex" },
      actualSizeBytes: { type: "bigint", note: "bytes" },
      providerId: { type: "bigint", note: "SP Filecoin actor id" },
    },
    indexes: ["dealId", "providerId"],
  },
  porep_deal_terminated: {
    description: "PoRep Market deal terminated. endEpoch = payment obligation end.",
    columns: {
      dealId: { type: "bigint" },
      terminator: { type: "hex" },
      endEpoch: { type: "bigint", note: "epoch" },
    },
    indexes: ["dealId"],
  },
  porep_deal_rejected: {
    description: "PoRep Market deal proposal rejected by the SP",
    columns: {
      dealId: { type: "bigint" },
      rejector: { type: "hex" },
    },
    indexes: ["dealId"],
  },
  porep_deal_proposal_expired: {
    description: "PoRep Market deal proposal expired without acceptance",
    columns: {
      dealId: { type: "bigint" },
      expiredAtBlock: { type: "bigint" },
    },
    indexes: ["dealId"],
  },
  porep_proxy_created: {
    description: "PoRep ValidatorFactory deployed a per-deal Validator (the FilecoinPay operator for that deal). proxy = fp_rail_created.operator; dealId links to porep_deal_*. Discovers every per-deal operator address.",
    columns: {
      proxy: { type: "hex", note: "per-deal Validator = fp_rail_created.operator" },
      dealId: { type: "bigint" },
    },
    indexes: ["proxy", "dealId"],
  },
  porep_sp_registered: {
    description: "SP registered in the PoRep SP registry (separate from FOC ServiceProviderRegistry). providerId = Filecoin actor id; organization = the registering wallet (also the default payee).",
    columns: {
      providerId: { type: "bigint", note: "SP Filecoin actor id" },
      organization: { type: "hex" },
    },
    indexes: ["providerId", "organization"],
  },
  porep_sp_payee_updated: {
    description: "PoRep SP payee address changed. newPayee = fp_rail_created.payee; providerId = SP Filecoin actor id. Resolves rail payees to PoRep SPs. This event fires only when the payee changes. An SP whose initial custom payee never changes requires a getPayee(providerId) RPC read; otherwise organization from porep_sp_registered is the default payee.",
    columns: {
      providerId: { type: "bigint", note: "SP Filecoin actor id" },
      oldPayee: { type: "hex" },
      newPayee: { type: "hex" },
    },
    indexes: ["providerId", "newPayee"],
  },
  porep_sp_price_updated: {
    description: "PoRep SP price changed. newPrice = price per 32GiB sector per month as a raw integer. Deal rate = price * sectorCount / 86400 epochs. The payment token is chosen per-deal at createRail (mainnet: USDFC or axlUSDC), so scale by the deal's rail token decimals (USDFC 1e18, axlUSDC 1e6), not a fixed 1e18.",
    columns: {
      providerId: { type: "bigint", note: "SP Filecoin actor id" },
      oldPrice: { type: "bigint" },
      newPrice: { type: "bigint", note: "per 32GiB sector per month, smallest units of the deal's payment token (token is per-deal, not stored here)" },
    },
    indexes: ["providerId"],
  },
  porep_sp_capabilities_updated: {
    description: "PoRep SP advertised SLI capability thresholds changed. The four SLI columns are the SP's advertised capabilities.",
    columns: {
      providerId: { type: "bigint", note: "SP Filecoin actor id" },
      retrievabilityBps: { type: "int", note: "advertised SLI: retrievability, basis points" },
      bandwidthMbps: { type: "int", note: "advertised SLI: bandwidth, Mbps" },
      latencyMs: { type: "int", note: "advertised SLI: latency, ms" },
      indexingPct: { type: "int", note: "advertised SLI: indexing, percent" },
    },
    indexes: ["providerId"],
  },
  porep_sli_attestation_update: {
    description: "PoRep SLI oracle attestation for an SP. The four SLI columns are the measured values used to evaluate deal requirements during settlement. A below-threshold attestation causes zero payment for the settlement interval. lastUpdate is the Filecoin epoch of the attestation.",
    columns: {
      providerId: { type: "bigint", note: "SP Filecoin actor id" },
      lastUpdate: { type: "bigint", note: "Filecoin epoch of attestation" },
      retrievabilityBps: { type: "int", note: "attested SLI: retrievability, basis points" },
      bandwidthMbps: { type: "int", note: "attested SLI: bandwidth, Mbps" },
      latencyMs: { type: "int", note: "attested SLI: latency, ms" },
      indexingPct: { type: "int", note: "attested SLI: indexing, percent" },
    },
    indexes: ["providerId", "blockNumber"],
  },
}
