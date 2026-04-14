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

export const STANDARD_COLUMNS: Record<string, ColDef> = {
  id: { type: "text", note: "blockHash-logIndex" },
  txHash: { type: "hex" },
  txFrom: { type: "hex", note: "sender" },
  txValue: { type: "bigint", note: "FIL sent (18 dec)" },
  gasUsed: { type: "bigint" },
  effectiveGasPrice: { type: "bigint" },
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
    indexes: ["setId", "timestamp"],
  },
  pdp_proof_fee_paid: {
    description: "FIL proof fee paid on dataset creation",
    columns: {
      setId: { type: "bigint" },
      fee: { type: "bigint", note: "FIL, 18 dec" },
    },
    indexes: ["setId", "timestamp"],
  },
  pdp_possession_proven: {
    description: "Proof submission with challenge details",
    columns: {
      setId: { type: "bigint" },
      challengeCount: { type: "int", nullable: true },
      challenges: { type: "text", nullable: true, note: "JSON [{pieceId: int, offset: string}]" },
    },
    indexes: ["setId", "timestamp"],
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
    indexes: ["setId", "timestamp"],
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
    indexes: ["dataSetId", "providerId", "payer", "serviceProvider", "payee", "pdpRailId", "source", "timestamp"],
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
    indexes: ["dataSetId", "pieceId", "pieceCid", "timestamp"],
  },
  fwss_fault_record: {
    description: "Proving fault, SP missed deadline",
    columns: {
      dataSetId: { type: "bigint" },
      periodsFaulted: { type: "bigint", note: "consecutive misses" },
      deadline: { type: "bigint", note: "epoch" },
    },
    indexes: ["dataSetId", "timestamp"],
  },
  fwss_rail_rate_updated: {
    description: "Payment rate change on dataset rail",
    columns: {
      dataSetId: { type: "bigint" },
      railId: { type: "bigint" },
      newRate: { type: "bigint", note: "USDFC/epoch, 18 dec" },
    },
    indexes: ["dataSetId", "railId", "timestamp"],
  },
  fwss_service_terminated: {
    description: "Full service termination",
    columns: {
      caller: { type: "hex" },
      dataSetId: { type: "bigint" },
      pdpRailId: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
    },
    indexes: ["dataSetId", "pdpRailId", "caller", "timestamp"],
  },
  fwss_pricing_updated: {
    description: "Global storage pricing change",
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
    indexes: ["railId", "payer", "payee", "token", "operator", "timestamp"],
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
    indexes: ["railId", "timestamp"],
  },
  fp_rail_terminated: {
    description: "Rail terminated",
    columns: {
      railId: { type: "bigint" },
      by: { type: "hex" },
      endEpoch: { type: "bigint" },
    },
    indexes: ["railId", "timestamp"],
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
    indexes: ["to", "from", "timestamp"],
  },
  fp_withdrawal: {
    description: "Token withdrawal",
    columns: {
      token: { type: "hex" },
      from: { type: "hex" },
      to: { type: "hex" },
      amount: { type: "bigint", note: "18 dec" },
    },
    indexes: ["from", "timestamp"],
  },
  fp_rail_rate_modified: {
    description: "Payment rate change on rail",
    columns: {
      railId: { type: "bigint" },
      oldRate: { type: "bigint" },
      newRate: { type: "bigint" },
    },
    indexes: ["railId", "timestamp"],
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
    description: "FIL burned via fee auction (no event, from tx data)",
    columns: {
      token: { type: "hex" },
      recipient: { type: "hex" },
      requestedAmount: { type: "bigint" },
      filBurned: { type: "bigint" },
      caller: { type: "hex" },
    },
    indexes: ["token", "timestamp"],
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
    indexes: ["dataSetId", "operator", "timestamp"],
  },
  fb_cdn_settlement: {
    description: "CDN payment rail settled by FilBeam (joins to fwss_data_set_created.cdn_rail_id)",
    columns: {
      operator: { type: "hex" },
      dataSetId: { type: "bigint" },
      cdnAmount: { type: "bigint", note: "USDFC settled in this event, capped to rail lockupFixed" },
    },
    indexes: ["dataSetId", "operator", "timestamp"],
  },
  fb_cache_miss_settlement: {
    description: "Cache-miss payment rail settled by FilBeam (joins to fwss_data_set_created.cache_miss_rail_id)",
    columns: {
      operator: { type: "hex" },
      dataSetId: { type: "bigint" },
      cacheMissAmount: { type: "bigint", note: "USDFC settled in this event, capped to rail lockupFixed" },
    },
    indexes: ["dataSetId", "operator", "timestamp"],
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
    indexes: ["dataSetId", "providerId", "payer", "serviceProvider", "payee", "pdpRailId", "source", "timestamp"],
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
    indexes: ["dataSetId", "pieceId", "pieceCid", "timestamp"],
  },
  storacha_fwss_fault_record: {
    description: "Storacha FWSS proving fault, SP missed deadline",
    columns: {
      dataSetId: { type: "bigint" },
      periodsFaulted: { type: "bigint", note: "consecutive misses" },
      deadline: { type: "bigint", note: "epoch" },
    },
    indexes: ["dataSetId", "timestamp"],
  },
  storacha_fwss_rail_rate_updated: {
    description: "Storacha FWSS payment rate change on dataset rail",
    columns: {
      dataSetId: { type: "bigint" },
      railId: { type: "bigint" },
      newRate: { type: "bigint", note: "USDFC/epoch, 18 dec" },
    },
    indexes: ["dataSetId", "railId", "timestamp"],
  },
  storacha_fwss_service_terminated: {
    description: "Storacha FWSS full service termination",
    columns: {
      caller: { type: "hex" },
      dataSetId: { type: "bigint" },
      pdpRailId: { type: "bigint" },
      cacheMissRailId: { type: "bigint" },
      cdnRailId: { type: "bigint" },
    },
    indexes: ["dataSetId", "pdpRailId", "caller", "timestamp"],
  },
  storacha_fwss_pricing_updated: {
    description: "Storacha FWSS global storage pricing change",
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
}
