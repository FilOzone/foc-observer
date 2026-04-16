/**
 * Domain knowledge for FOC observability.
 *
 * INSTRUCTIONS: Dense system overview, always injected into the agent's context.
 * Enough for casual questions and correct tool result interpretation.
 *
 * SYSTEM_CONTEXT: Deep protocol mechanics, returned by the get_system_context tool.
 * Called once at the start of analytical work for complete understanding.
 *
 * Both contain {{BASE_URL}} placeholders for the FOC Observer API base URL.
 * Each consumer resolves these:
 * - Client: prebuild script substitutes at build time (baked into npm package)
 * - Server: resolved at runtime via resolveSystemContext()
 */

function resolveUrl(baseUrl?: string): string {
  const url = baseUrl ?? process.env.FOC_API_URL
  if (!url) throw new Error("FOC_API_URL environment variable is required (or pass baseUrl to resolveSystemContext)")
  return url.replace(/\/$/, "")
}

/** Resolve {{BASE_URL}} placeholders in INSTRUCTIONS and SYSTEM_CONTEXT. */
export function resolveSystemContext(baseUrl?: string): { instructions: string; systemContext: string } {
  const url = resolveUrl(baseUrl)
  return {
    instructions: INSTRUCTIONS.replace(/\{\{BASE_URL\}\}/g, url),
    systemContext: SYSTEM_CONTEXT.replace(/\{\{BASE_URL\}\}/g, url),
  }
}

export const INSTRUCTIONS = `FOC (Filecoin Onchain Cloud) is a decentralized storage services marketplace on Filecoin. Clients pay storage providers (SPs) to store data, with payments and data-possession proofs managed on-chain.

IMPORTANT - two-step activation:
1. Call get_system_context FIRST to load protocol knowledge.
2. Analytical tools require i_have_read_the_system_context: true. Simple lookups (get_providers, get_provider, get_pricing, list_tables, describe_table, get_status) do not.

## What You Can Query

**"What's happening now?"** -> Live contract state tools: get_providers, get_provider (with capabilities), get_dataset, get_dataset_proving, get_rail, get_pricing, get_account, get_auction

**"What happened historically?"** -> SQL against indexed events: query_sql. All contract events since deployment on both networks.

**"How healthy are providers?"** -> Deal/retrieval rates: get_dealbot_providers, get_dealbot_provider_detail. Proving fault rate: get_proving_health (primary, computed from indexed PDPVerifier events). Cross-validation: get_proving_health_goldsky (PDP Explorer subgraph). Error analysis: get_dealbot_failures.

**Default to mainnet** unless the user asks about calibnet. Both are fully indexed.

## The Stack (layered, not monolithic)

FOC is a layered system. The foundation is generic; service contracts are opinionated applications on top.

**Foundation (generic, service-agnostic):**
- **FilecoinPay**: Payment rails, streaming and one-time. Any service can build on it.
- **PDPVerifier**: Proof of Data Possession, neutral proof protocol. No business logic. Calls service contracts via callbacks.
- **ServiceProviderRegistry**: SP registration, names, capabilities, product metadata.
- **SessionKeyRegistry**: Scoped delegation keys for reduced-friction operations.

**Service contracts (opinionated applications built on FilecoinPay):**
- **FWSS (FilecoinWarmStorageService)**: FilOz's warm storage service. Creates 3 payment rails per dataset (PDP, CDN, cache-miss), validates proving, manages pricing. Operator: 0x8408502033c418e1bbc97ce9ac48e5528f371a9f (mainnet). Indexed in fwss_* tables.
- **Storacha (FWSS fork)**: A separate FWSS-fork listener contract running on the SAME PDPVerifier and SAME FilecoinPay as FilOz's FWSS. Mainnet: 0x56e53c5e7f27504b810494cc3b88b2aa0645a839. Calibnet: 0x0c6875983B20901a7C3c86871f43FdEE77946424. Their SPs are registered in the SAME ServiceProviderRegistry but use did:key names. Largest FilecoinPay user by volume. Indexed in storacha_fwss_* tables (mirror of fwss_* schema).
- **ProviderIdSet**: Curated endorsed provider set, maintained by FilOz.

**FilBeam (CDN bandwidth ledger):** Non-upgradeable operator contract. Off-chain measures CDN/cache-miss bytes per dataset, periodically calls recordUsageRollups -> emits UsageReported. Settlement of CDN rails happens via FilBeamOperator.settleCDNPaymentRails -> FWSS.settleFilBeamPaymentRails -> FilecoinPay one-time payment. Indexed in fb_* tables. Multiple historical addresses per network (redeployed periodically); join to fwss_data_set_created via data_set_id, then to fp_rail_created via cdn_rail_id / cache_miss_rail_id. NOT used by Storacha.

**CRITICAL: FilecoinPay is operator-agnostic.** Multiple service contracts use it independently. For network-wide aggregate metrics (total deposits, total settlements, ARR), always start from fp_* tables without joining to fwss_* tables. Only narrow to fwss_* when analyzing FWSS-specific behavior. fwss_* events only fire for FWSS-operated rails; storacha_fwss_* events only fire for Storacha-operated rails. PDPVerifier events (pdp_* tables) and FilecoinPay events (fp_* tables) cover BOTH service contracts since they share the underlying infrastructure.

**Provider tiers** (each a subset of the previous):
1. **Registered** (isActive): in ServiceProviderRegistry. Any SP can register.
2. **Approved** (isApproved): passes DealBot quality checks. Can be secondary copy target.
3. **Endorsed** (isEndorsed): curated highest-trust set. Primary copy target for the SDK.

## Key Terms

- **Data Set**: Pieces stored by one SP for one client. FWSS datasets have 3 rails (PDP, CDN, cache-miss). Non-FWSS operators may structure rails differently.
- **Rail**: Payment channel (railId, payer, payee, rate, lockup). endEpoch > 0 = terminated.
- **Proving period**: SP must prove data possession each period (calibnet ~2h, mainnet ~24h). 5 challenges per dataset per period. Missing the 20-epoch challenge window = fault.
- **FaultRecord**: Fires only when nextProvingPeriod is called with missed proof. Silent SPs produce NO fault events.
- **Operator**: Contract that manages rails on FilecoinPay. Multiple operators can exist: FWSS is one, Storacha runs another. Query SELECT DISTINCT operator FROM fp_rail_created to find all operators. Validator: arbiter during settlement (checks proofs on PDP rails; CDN rails have no validator).
- **Settlement**: Funds flow from payer to payee. For PDP rails: proven periods = full payment, faulted = zero, open = blocked. All fp_rail_settled amount fields are INCREMENTAL per event, SUM() for totals.
- **USDFC**: Payment token. All amounts bigint, 18 decimals (divide by 1e18).
- **Epoch**: Filecoin block height, ~30 seconds. block_number in database = epoch.
- **Piece**: Data unit with PieceCID (max 1016 MiB, Curio limit). raw_size in fwss_piece_added is the exact original data size.
- **Leaf**: 32-byte chunk of FR32-expanded piece data. leafCount reflects expanded size, do NOT use as a proxy for raw data size.
- **FIL Burn**: Settlement fees (0.5%) + sybil fees (0.1 USDFC per dataset) accumulate in auction pool. Dutch auction decays price; anyone can claim USDFC by sending FIL (burned).

## Data Conventions

- Amounts: bigint, 18 decimals. 1 USDFC = 1000000000000000000.
- Timestamps: unix seconds. Use TO_TIMESTAMP(timestamp) for dates.
- Provider IDs: small integers. Always resolve to names via get_providers, show as "Name (ID)".
- Dataset metadata: "source" identifies creating app (e.g. "filecoin-pin"). Indexed column.
- Known wallets (both networks): DealBot (legacy): 0xa5F90bc2AA73a2E0Bad4D7092a932644d5dD5d71, DealBot (current multisig): 0x305025D07c1DEe47F25a4990179eFf2becddCA0B, Storacha: 0x3c1ae7a70a2b51458fcb7927fd77aae408a1b857, Tippy/ezpdpz: 0x3E4E5f067cfdA2F16Aade21912B8324c3D9624F8 (endorsed SP operator), PinMe: 0xd19d84c77bbb901971e460830e310933a210dbaa. Use payer address to filter by party, not source metadata.
- Storacha runs a separate service contract (FWSS fork) as both operator and validator on their rails. Their SPs use did:key names in ServiceProviderRegistry and are not managed by FWSS. Storacha is the largest FilecoinPay user on mainnet by deposit and settlement volume.
- 3 rails per dataset: PDP (storage, validated), CDN (bandwidth, unvalidated), cache-miss (origin fetch, unvalidated).
- fwss tables use data_set_id, pdp tables use set_id, same value, JOIN them directly.

## Source Code and References

- **FWSS + SPRegistry + SessionKeyRegistry**: https://github.com/FilOzone/filecoin-services
- **PDPVerifier**: https://github.com/FilOzone/pdp
- **FilecoinPay**: https://github.com/FilOzone/filecoin-pay
- **Synapse SDK** (client library): https://github.com/FilOzone/synapse-sdk
- **DealBot** (quality assurance): https://github.com/FilOzone/dealbot
- **Deployed contract addresses**: https://github.com/FilOzone/filecoin-services/blob/main/service_contracts/deployments.json
- **DealBot dashboard**: https://dealbot.filoz.org (mainnet), https://staging.dealbot.filoz.org (calibnet)
- **FilOz** (team): an independent public good Filecoin protocol design and development team in the Filecoin Network working on protocol improvements and security https://filoz.org`

export const SYSTEM_CONTEXT = `# FOC Protocol Mechanics

This document provides complete protocol knowledge for interpreting FOC contract state and events. Read this fully before performing any analysis.

## Payment Rails (FilecoinPay)

A rail is a payment channel: payer -> payee, managed by an operator, optionally arbitrated by a validator.

## Dataset and Rail Lifecycle

Three layers of lifecycle state. Understanding these is critical for correct queries.

**PDPVerifier layer (protocol)**: Binary -- a dataset is either LIVE or DELETED. dataSetLive(setId) returns true when the ID has been allocated AND storageProvider is non-zero. PDPVerifier has NO concept of termination, faulting, or delinquency. A dataset is deleted only when the SP explicitly calls deleteDataSet(), which zeroes storageProvider. The dataset ID is never reused. Deletion is rare and happens only after FWSS-level finalization is complete.

**FWSS/Storacha layer (service)**: The service-level lifecycle with termination and lockup states.

Dataset state machine:
- **Active** (pdpEndEpoch=0): pieces being stored, SP proving, settlement via validatePayment. New pieces can be added.
- **Terminated/Lockup** (pdpEndEpoch > 0, pdpEndEpoch > current epoch): Service is ending but lockup period is running. SP MUST continue proving (gets paid for proven periods, zero for faults). No new pieces can be added. Piece removals still allowed.
- **Post-Lockup** (pdpEndEpoch > 0, pdpEndEpoch <= current epoch): Lockup expired. No more proving. Settlement completes to endEpoch.
- **Finalized**: All rails settled and zeroed (getRail reverts). Dataset still exists in PDPVerifier.
- **Deleted**: SP called PDPVerifier.deleteDataSet(). All state cleared. Permanent.

**CRITICAL: pdpEndEpoch is the epoch when payment obligation ENDS, not when termination was requested.** For a fully-funded payer: pdpEndEpoch = termination_block + lockup_period (86400 epochs = 30 days). For an underfunded payer: pdpEndEpoch = last_funded_epoch + lockup_period (could be closer to or even before the current epoch).

**Rail lifecycle (FilecoinPay layer)**:
- Active (endEpoch=0): streaming payments at paymentRate.
- Terminated (endEpoch > 0): endEpoch = lockupLastSettledAt + lockupPeriod. NOT block.number + lockupPeriod.
  - endEpoch in the future: lockup running, settlement continues up to current epoch
  - endEpoch in the past: lockup expired, final settlement to endEpoch, then auto-finalization
- Finalized: all rail data zeroed. getRail() reverts. Unused lockupFixed returned to payer.

**Key fields from getRail()**: paymentRate (USDFC/epoch), lockupPeriod (epochs, FWSS=86400), lockupFixed (for one-time payments, 0 for PDP rails), settledUpTo (last settled epoch, cumulative), endEpoch (0=active, >0=terminated), validator (address(0)=no validator for CDN, FWSS address=PDP).

**Lockup is NOT a pre-payment**: While active, payments come from payer's general funds. Lockup is a withdrawal floor -- it prevents the payer from withdrawing below the lockup amount, but it does NOT guarantee the funds are actually there. A payer can be "delinquent" (underfunded) if their balance is below the lockup requirement; settlement halts and lockupLastSettledAt stops advancing. After termination, lockup becomes the payment source. If fully funded at termination time, the SP gets the full 30-day guarantee. If underfunded, the guarantee is shorter (endEpoch = last_funded_epoch + lockupPeriod, which may be closer to or even before the current epoch).

**Settlement**: settleRail() moves funds payer->payee. For PDP rails, FWSS.validatePayment() checks proofs: proven=full payment, faulted=zero, open period=blocked. Escape hatch: settleTerminatedRailWithoutValidation (payer-only, after endEpoch passes) bypasses a stuck validator.

**Piece removal is deferred**: schedulePieceDeletions() queues removals. Actual deletion happens in next nextProvingPeriod() call. Pieces remain challengeable until then. pdp_pieces_removed records scheduling; leafCount decreases at the proving boundary. When all pieces are removed, DataSetEmpty fires.

**Rate changes**: Create segments in a queue. Settlement processes each with the rate that applied during that time. Adding pieces = immediate rate increase. Removing pieces = deferred rate decrease (next proving boundary).

## Querying Active vs Terminated Datasets

**Active FWSS datasets (never terminated)**:
SELECT d.* FROM fwss_data_set_created d WHERE NOT EXISTS (SELECT 1 FROM fwss_service_terminated t WHERE t.data_set_id = d.data_set_id)

**Active Storacha datasets**: Same pattern with storacha_fwss_* tables.

**Terminated but still in lockup** (SP still proving, payments still flowing): Use get_dataset(dataSetId) and check pdpEndEpoch > 0 AND pdpEndEpoch > current_epoch. In SQL, you can approximate current epoch as EXTRACT(EPOCH FROM NOW()) / 30 (epoch = unix_seconds / 30, rough).

**Datasets still live in PDPVerifier** (not deleted): SELECT d.* FROM pdp_data_set_created d WHERE NOT EXISTS (SELECT 1 FROM pdp_data_set_deleted del WHERE del.set_id = d.set_id)

**Truly active (not terminated, not empty, recently proving)**: SELECT d.* FROM fwss_data_set_created d WHERE NOT EXISTS (SELECT 1 FROM fwss_service_terminated t WHERE t.data_set_id = d.data_set_id) AND NOT EXISTS (SELECT 1 FROM pdp_data_set_empty e WHERE e.set_id = d.data_set_id) AND EXISTS (SELECT 1 FROM pdp_next_proving_period n WHERE n.set_id = d.data_set_id AND n.timestamp > EXTRACT(EPOCH FROM NOW()) - 259200)

**Rail status**: Active (endEpoch=0), terminated-in-lockup (endEpoch > current_epoch), post-lockup (endEpoch <= current_epoch), finalized (in fp_rail_finalized table). Use get_rail(railId) for live state or query fp_rail_terminated / fp_rail_finalized tables for historical events.

**Active pieces in a dataset**: Pieces can be removed during a dataset's lifetime. fwss_piece_added records all additions (with piece_id, piece_cid, raw_size). pdp_pieces_removed records removals (piece_ids as JSON array of integers). To find currently active pieces, exclude removed IDs: WITH removed_ids AS (SELECT set_id, jsonb_array_elements_text(piece_ids::jsonb)::int as piece_id FROM pdp_pieces_removed WHERE set_id = <ID>) SELECT p.* FROM fwss_piece_added p WHERE p.data_set_id = <ID> AND NOT EXISTS (SELECT 1 FROM removed_ids r WHERE r.set_id = p.data_set_id AND r.piece_id = p.piece_id). Same pattern works for storacha_fwss_piece_added with storacha table names. For a quick count: SELECT (SELECT COUNT(*) FROM fwss_piece_added WHERE data_set_id = <ID>) - COALESCE((SELECT SUM(piece_count) FROM pdp_pieces_removed WHERE set_id = <ID>), 0) as active_pieces. Also: get_dataset_proving returns activePieceCount for the live on-chain count.

## FWSS Data Sets

**Data set = data stored by one SP for one client**. Created via PDPVerifier.createDataSet() which calls FWSS.dataSetCreated(). FWSS creates 3 FilecoinPay rails atomically:
1. PDP rail: streaming payment for storage. FWSS is both operator and validator.
2. CDN rail: one-time payments for bandwidth. No validator. rate=0, uses lockupFixed.
3. Cache-miss rail: one-time payments for origin fetches. No validator.

**Data set state from get_dataset()**:
- pdpEndEpoch = 0: active. pdpEndEpoch > 0: terminated (check against current epoch to distinguish lockup-running vs post-lockup).
- metadata["source"] identifies the creating application. DealBot datasets have source "dealbot" (current) or "filecoin-pin" or NULL (historical, before source fix). Filter by payer address for reliable DealBot identification, not source metadata alone.
- metadata["withCDN"] = "true" means CDN rails are active.
- providerId links to ServiceProviderRegistry for SP details.

## Proving and Faults

**Proving periods**: Calibnet = 240 epochs (~2h). Mainnet = 2880 epochs (~24h). The SP must call provePossession() within the challenge window each period.

**Proving period convention**: Exclusive-inclusive ranges (A, A+M]. Activation epoch A is a boundary, not billable. Period N covers epochs (A+N*M, A+(N+1)*M]. The deadline is A+(N+1)*M.

**FaultRecord events**: CRITICAL - FaultRecord only fires when nextProvingPeriod() is called. If an SP stops calling nextProvingPeriod entirely, NO fault events are emitted. Silence does NOT mean the SP is healthy. To detect truly dead SPs, look for data sets with no recent pdp_next_proving_period events.

**periodsFaulted**: The count of consecutive proving periods missed since the last successful proof. This resets to 0 when the SP proves successfully. A periodsFaulted of 20 means the SP missed 20 consecutive periods before nextProvingPeriod was called.

**Proving status from get_dataset_proving()**:
- live: is the data set active in PDPVerifier
- provenThisPeriod: has the SP proven in the current period (false + approaching deadline = about to fault)
- lastProvenEpoch: when the last successful proof was submitted
- provingDeadline: deadline for the current period
- activePieceCount: number of live pieces (0 after all pieces removed)

## Settlement Validation

When FilecoinPay calls FWSS.validatePayment() during settlement:

Each proving period in the settlement range is classified:
- **Proven**: Proof submitted. Full payment for those epochs.
- **Faulted**: Deadline passed, no proof. Zero payment, but settlement advances (settledUpTo moves forward).
- **Open**: Deadline not yet passed. Settlement BLOCKED at the period boundary - can't settle into an unresolved period.

This means:
- An SP that consistently proves gets full payment.
- An SP that faults gets zero payment for faulted periods but the rail can still be settled and finalized.
- Settlement can temporarily stall if the current period is open (waiting for proof or deadline).

## Token Addresses

**USDFC** (the payment token for FOC storage):
- Calibnet: 0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0
- Mainnet: 0x80B98d3aa09ffff255c3ba4A241111Ff1262F045

**Native FIL**: represented as address(0) = 0x0000000000000000000000000000000000000000

In FilecoinPay tables, the token column distinguishes USDFC-denominated rails from FIL-denominated rails. Most FOC rails use USDFC. Filter by token address to separate them.

## FilecoinPay Analytics

The fp_* tables provide full payment flow visibility:

**Fund flow**: fp_deposit (money in) -> fp_rail_settled (payments processed) -> fp_withdrawal (money out)

**Per-wallet**: JOIN fp_deposit/fp_withdrawal on the "from"/"to" columns for deposit/withdrawal history per address. fp_rail_created.payer and .payee link wallets to rails.

**Per-rail lifecycle**: fp_rail_created (birth) -> fp_rail_rate_modified (rate changes) -> fp_rail_settled (payments) -> fp_rail_terminated (end) -> fp_rail_finalized (zeroed out).

**IMPORTANT - fp_rail_settled fields are INCREMENTAL per event, not cumulative:**
- total_settled_amount: gross amount settled in THIS event (not all-time). Despite the misleading name "total", SUM() across events gives the correct all-time gross.
- total_net_payee_amount: net to SP in this event (gross minus fees). SUM() gives all-time net revenue.
- network_fee: fee taken in this event. SUM() gives all-time fees.
- operator_commission: commission in this event (currently 0 for FOC rails).
- Relationship: total_settled_amount = total_net_payee_amount + network_fee + operator_commission (per event).
- settled_up_to: the epoch up to which settlement has been processed. This IS cumulative / monotonically increasing per rail.

**Per-provider revenue (FWSS only)**: JOIN fp_rail_settled with fwss_data_set_created ON rail_id = pdp_rail_id to link settlements to FWSS providers. GROUP BY provider_id. NOTE: this misses non-FWSS operators (e.g. Storacha). For total FilecoinPay revenue across all operators, use fp_rail_settled directly grouped by rail_id or joined to fp_rail_created for payer/payee/operator breakdown.

**Per-ERC20**: Filter any fp_* table by the token column. fp_rail_created.token identifies the currency. fp_deposit.token and fp_withdrawal.token show token-specific flows.

**Commission breakdown**: Each fp_rail_settled event has totalSettledAmount (gross for this settlement), totalNetPayeeAmount (to SP), operatorCommission (to the operator, currently 0 for both FWSS and Storacha), networkFee (burned/auctioned, 0.5%). Per-event split: gross = net + commission + fee. SUM() each field across events for totals.

**One-time payment rails**: Rails with paymentRate=0 and lockupFixed>0 are used for one-time payments (not streaming). The payment is processed via fp_one_time_payment (not fp_rail_settled). These rails are typically created, paid, and finalized quickly - sometimes in the same block.

Two uses of one-time payment rails:
1. **CDN/cache-miss payments**: Per-data set rails for bandwidth usage. JOIN with fwss_data_set_created via cdn_rail_id or cache_miss_rail_id.
2. **Sybil fee rails** (v1.2.0+): Each data set creation creates an extra rail paying ~0.1 USDFC (0.0995 net after 0.5% fee) to the FilecoinPay contract address as a one-time sybil prevention fee. These rails have payee=FilecoinPay contract, rate=0, and are immediately finalized.

To identify one-time payment rails: paymentRate=0 in fp_rail_created, non-zero fp_one_time_payment amounts. To distinguish sybil fee rails specifically: payee is the FilecoinPay contract address.

**Operator approvals**: fp_operator_approval tracks which wallets have approved which operators (typically FWSS) with an approved boolean.

## Pricing Economics

- Storage: 2.5 USDFC per TiB/month (configurable by contract owner)
- Minimum floor: 0.06 USDFC/month for data sets under 24.576 GiB (0.024 TiB; below this size, the per-TiB rate would be less than the minimum)
- Rate per epoch = max(sizeBasedRate, minimumRate)
- EPOCHS_PER_MONTH = 86400 (2880/day * 30 days)
- Lockup = 30 days of payment = finalRate * 86400

**Example**: A 1 TiB data set costs 2.5 USDFC/month. Rate per epoch = 2.5 / 86400 ≈ 0.0000289 USDFC/epoch. Lockup = 2.5 USDFC.

## FIL Burn Mechanisms

USDFC accumulates in FilecoinPay's fee auction pool from two sources, then claimants convert it to FIL burns:

**Source 1 - Settlement network fee:** During settleRail on USDFC-denominated rails, a 0.5% network fee is taken. This fee is credited to the FilecoinPay contract's own internal account (the auction pool). Visible in fp_rail_settled.network_fee (USDFC, 18 decimals). Produces small amounts per settlement (~0.00007 USDFC per minimum-rate rail).

**Source 2 - Sybil fee on data set creation (v1.2.0+):** Each data set creation charges a 0.1 USDFC sybil fee from the client's FilecoinPay balance. FWSS creates a temporary "burn rail" (client -> FilecoinPay contract address), deposits the fee via lockupFixed, then immediately terminates + settles + finalizes the rail in the same transaction. The entire 0.1 USDFC lands in the auction pool. The burn rail is finalized and invisible after creation (getRail reverts). This is the dominant source of auction pool growth - each data set creation adds 0.1 USDFC, dwarfing the trickle from settlement network fees. The sybil fee amount is set at PDPVerifier initialization (USDFC_SYBIL_FEE constant).

**Fee auction / burnForFees (USDFC -> FIL conversion):** Accumulated USDFC from both sources is auctioned via Dutch auction. Anyone can call burnForFees(token) to claim the entire pool, sending FIL (burned to f099). burnForFees has NO event - tracked via transaction input data in the fp_burn_for_fees table. Fields: token, recipient, requested_amount (USDFC claimed), fil_burned (FIL sent/burned).

**Dutch auction pricing:** The FIL price decays exponentially: currentPrice = startPrice / 2^(elapsed / HALVING_INTERVAL) where HALVING_INTERVAL = 3.5 days (302400 seconds). startPrice and startTime are returned by the get_auction tool. After a claim, the new startPrice resets to 4x what was paid (RESET_FACTOR = 4), targeting roughly one auction per week. To compute current price: elapsed = now - startTime, halvings = elapsed / 302400, currentPrice = startPrice / 2^halvings. Anyone can claim at this price, paying FIL for the entire accumulated USDFC pool.

**Direct FIL burn (FIL-denominated rails):** If a rail uses native FIL as the payment token (not USDFC), the network fee is burned directly during settlement. Also visible in fp_rail_settled.network_fee but denominated in FIL.

**To analyze total burn:**
- USDFC in auction pool: SUM(network_fee) from fp_rail_settled (USDFC rails) + count of data set creations * 0.1 USDFC - SUM(requested_amount) from fp_burn_for_fees
- FIL burned via auction: SUM(fil_burned) from fp_burn_for_fees
- FIL burned directly: SUM(network_fee) from fp_rail_settled for FIL-denominated rails
- To distinguish USDFC vs FIL rails, join fp_rail_settled with fp_rail_created on rail_id and check the token address

## Service Provider Registry and Provider Tiers

Providers register with a name, description, and capabilities. Use get_providers to fetch all providers with their full status in one call.

**Three-tier trust model:**

1. **Registered** (isActive=true): The SP has registered in ServiceProviderRegistry with a name and wallet address. This is the base tier - any SP can register by paying the registration fee. Being registered alone does not mean the SP can participate in FOC storage.

2. **Approved** (isApproved=true): The SP has been approved in FWSS for storing client data. Approval is granted after passing automated quality checks run by DealBot (the FOC quality assurance system that continuously tests SPs). Approved providers can receive data as secondary copy targets but are not selected as primaries by default.

3. **Endorsed** (isEndorsed=true): The SP is in the curated ProviderIdSet contract - the highest trust tier. Endorsed status is manually granted to SPs that meet quality and reliability standards. The SDK only selects endorsed providers as primary copy destinations. This is a hard constraint - there is no fallback to non-endorsed for primary copies.

Each tier is a subset: endorsed < approved < registered. A provider can be registered but not approved (hasn't passed DealBot checks), or approved but not endorsed (reliable but not curated into the top tier).

**When analyzing providers:**
- Faults from endorsed providers are more concerning than from non-endorsed - these are the SPs we've explicitly vouched for
- An approved-but-not-endorsed provider faulting is expected noise on calibnet
- A registered-but-not-approved provider won't have any data sets (FWSS won't let clients store with them)

Always resolve provider IDs to names when presenting data. Show as "Name (ID)" format.

**Provider capabilities (from ServiceProviderRegistry products):**

SPs register products (currently productType=0 for PDP storage) with key-value capabilities stored on-chain. Capability values are bytes on-chain but typically UTF-8 strings. In the indexed tables (spr_product_added, spr_product_updated), capabilities are stored as JSON objects with string keys and decoded string values.

Required PDP capability keys:
- serviceURL: the SP's API endpoint (e.g. "https://curio-pdp.example.com")
- minPieceSizeInBytes, maxPieceSizeInBytes: piece size range
- storagePricePerTibPerDay: price in token's smallest unit
- minProvingPeriodInEpochs: minimum proving period
- location: geographic location, typically in format "C=US;ST=California;L=San Francisco" (C=country ISO, ST=state, L=city)
- paymentTokenAddress: ERC-20 token address for payment (address(0) for FIL)

Known optional PDP capability keys (not exhaustive - SPs can register arbitrary keys):
- ipniPiece: supports IPNI piece CID indexing
- ipniIpfs: supports IPNI IPFS CID indexing
- ipniPeerId: IPNI peer ID

To query capabilities: SELECT capabilities::jsonb->>'location' FROM spr_product_added WHERE provider_id = 1
To find SPs in a country: SELECT * FROM spr_product_added WHERE capabilities::jsonb->>'location' LIKE 'C=CN%'

## Network Differences

| Property | Calibnet | Mainnet |
|----------|----------|---------|
| Chain ID | 314159 | 314 |
| Proving period | 240 epochs (~2h) | 2880 epochs (~24h) |
| Proving frequency | 12x/day | 1x/day |
| Fault volume | Very high (12x frequency) | Much lower |
| Provider count | ~25 | ~5 |
| Purpose | Testing | Production (real money) |

Calibnet's 12x proving frequency generates 12x the events (proofs, faults, settlements) compared to mainnet. Do not compare raw event counts between networks without normalizing for proving frequency.

## Contract Deployment History

The current FOC contracts (same proxy addresses) were deployed across two releases. All data in the indexed tables originates from these deployments.

**v1.0.0 - GA Release (November 2, 2025)**
- First deployment of the current proxy addresses on both networks.
- Calibnet: ~epoch 3,158,000. Indexed from epoch 3,155,000.
- Mainnet: ~epoch 5,220,000. Indexed from epoch 5,215,000.
- Introduced: FWSS GA contracts, FilecoinPay v1, PDPVerifier v3.1.0, ServiceProviderRegistry with capability key-value store, SessionKeyRegistry.
- Source: [filecoin-services v1.0.0](https://github.com/FilOzone/filecoin-services/releases/tag/v1.0.0)

**v1.1.0 - Upgrade (January 30, 2026)**
- UUPS proxy upgrade of FWSS, PDPVerifier, and ServiceProviderRegistry. Same proxy addresses, new implementation contracts.
- Calibnet: ~epoch 3,414,500. Mainnet: ~epoch 5,476,400.
- Added: ProviderIdSet (endorsed providers), two-step upgrade announcements, CDN validation, automatic rate modification on piece addition.
- Changed: rail settlement required before data set deletion, deferred rate recalculation.
- Source: [filecoin-services v1.1.0](https://github.com/FilOzone/filecoin-services/releases/tag/v1.1.0)
- Deployed addresses: [deployments.json](https://github.com/FilOzone/filecoin-services/blob/v1.1.0/service_contracts/deployments.json)

**v1.2.0 - Upgrade (March 18-19, 2026)**
- UUPS proxy upgrade of FWSS and PDPVerifier. Same proxy addresses.
- Calibnet: March 18. Mainnet: March 19.
- Added: USDFC sybil fee on data set creation (0.1 USDFC per data set, replaces 0.1 FIL proof fee). Fee flows through a temporary burn rail into the FilecoinPay auction pool. PDPVerifier whitelisted to skip the old 0.1 FIL fee. PDPVerifier getActivePiecesByCursor for paginated piece queries.
- Impact on fee auction: pool now grows by 0.1 USDFC per data set creation (dominant source), not just settlement trickle.

To query upgrade history: SELECT contract, version, implementation, TO_TIMESTAMP(timestamp) as upgraded_at FROM contract_upgraded ORDER BY block_number. This shared table covers PDPVerifier, FWSS, and SPRegistry upgrades.

**Earlier deployments (v0.2.0, v0.3.0)** used different proxy addresses and are not indexed. Data from those deployments is not available.

When interpreting data: events before ~epoch 3,414,500 (calibnet) / ~5,476,400 (mainnet) were under v1.0.0 semantics. Events after are under v1.1.0. v1.2.0 added the sybil fee mechanism - data sets created after v1.2.0 deposit 0.1 USDFC into the auction pool.

## Tool Data Provenance

Each tool gets its data from a specific upstream source. When explaining results to users, cite the source and method.

**Indexed event tools** (query_sql, list_tables, describe_table, get_status):
- Source: Ponder EVM indexer writing to Postgres.
- How: Ponder watches Filecoin blocks via Lotus RPC (eth_getLogs), decodes contract events using ABIs, writes rows to Postgres tables. One row per event emission. Transaction receipt data (gas_used, effective_gas_price, tx_from, tx_value) is fetched alongside each event.
- Coverage: calibnet from epoch 3,155,000, mainnet from epoch 5,215,000. Both before v1.0.0 deployment.
- Limitation: Only captures events that contracts emit. If an SP stops calling nextProvingPeriod, no fault events are emitted - silence in the data does NOT mean health. The fp_burn_for_fees table is special: indexed from transaction input data (no event emitted by the contract).

**Live contract state tools** (get_providers, get_provider, get_dataset, get_dataset_proving, get_rail, get_pricing, get_account, get_auction):
- Source: Direct eth_call to Filecoin via Lotus RPC using viem.
- How: Reads current contract storage via view functions. get_providers calls ServiceProviderRegistry.providerCount(), then getProvider() for each, plus FWSS.isProviderApproved() and ProviderIdSet.has() for tier status. get_dataset calls FWSS StateView.getClientDataSetInfo(). get_rail calls FilecoinPay.getRail().
- Coverage: Always current block. No history.
- Limitation: A finalized rail (fully settled + zeroed) will revert on getRail(). This is expected, not an error.

**Deal/retrieval quality tools** (get_dealbot_stats, get_dealbot_providers, get_dealbot_provider_detail, get_dealbot_daily):
- Source: BetterStack ClickHouse, querying Prometheus counter metrics exported by DealBot.
- How: DealBot (TypeScript/NestJS on K8s) continuously tests all registered SPs: 4 storage deals/SP/hour (96/day), 4 IPFS retrievals/SP/hour. Each test outcome increments a Prometheus counter (dataStorageStatus or retrievalStatus, labeled success/failure + providerId). BetterStack ingests these counters. Our ClickHouse queries compute delta per Prometheus series_id (to handle pod restart counter resets), then sum across series per provider.
- Fields returned: providerId, providerName, providerStatus, totalDeals, dealSuccesses, dealFailures, dealSuccessRate, totalIpfsRetrievals, ipfsRetrievalSuccesses, ipfsRetrievalFailures, ipfsRetrievalSuccessRate.
- Time windows: quantized to 1h/6h/12h/24h/72h/7d/30d/90d. Cached 5-60min depending on window.
- Limitation: Sample counts are ~10-15% lower than DealBot's actual database due to Prometheus counter aggregation across pod restarts. Success RATES are accurate; absolute counts slightly understated. For authoritative absolute counts, dealbot.filoz.org is the source.

**Failure analysis tool** (get_dealbot_failures):
- Source: DealBot REST API directly (staging.dealbot.filoz.org/api for calibnet, dealbot.filoz.org/api for mainnet).
- How: Calls /v1/metrics/failed-deals/summary and /v1/metrics/failed-retrievals/summary. These are recent failure aggregations from DealBot's own database (not Prometheus).
- Fields: error messages, counts, affected providers. Error categories: "fetch failed" = SP unreachable, 502 = backend down, "LockupNotSettledRateChangeNotAllowed" = payment contract issue.

**Proving health tools** (get_proving_health, get_proving_dataset):
- Source: Local computation from indexed PDPVerifier events (pdp_next_proving_period, pdp_possession_proven, pdp_data_set_created). Operator-agnostic -- works for FWSS, Storacha, any future service contract.
- How: The "proof-gap" method. For each pair of consecutive NextProvingPeriod events on a dataset, check whether a PossessionProven event exists in the window between them. No proof = fault. If the epoch gap spans multiple proving periods (SP went dark), the extra periods are inferred as skipped faults.
- Proving period derivation: NOT hardcoded. Derived per-dataset from the mode (most common gap) of observed consecutive NextProvingPeriod events. Works for any listener's configured maxProvingPeriod (FWSS=2880, calibnet=240, or any future value).
- Active dataset counting: A dataset is "active" only if it is not deleted, not emptied, AND has proved within the last 3 days. This avoids the ~35% inflation seen in the PDP Explorer subgraph's isActive field.
- Fields: totalProvingPeriods (including inferred skipped periods), totalFaultedPeriods (observed faults + inferred skipped faults), faultRate (faulted/total * 100). Weekly breakdown includes per-week periods, faults, proofs, datasets created, pieces added.
- Terminology: All counts are PROVING PERIODS, not individual challenges. The number of challenges per proof is listener-dependent (5 for FWSS) and is NOT assumed or multiplied.

**Goldsky cross-validation tools** (get_proving_health_goldsky, get_proving_dataset_goldsky):
- Source: PDP Explorer subgraph on Goldsky (independent computation, public GraphQL).
- Use for cross-validation when accuracy is critical. Compare results with get_proving_health.
- Known issues: hardcoded proving period (240 on mainnet, should be 2880 -- fix in PR #96), ~35% isActive inflation, hardcoded challengesPerProof=5, FWSS-centric service entities.
- Numbers may differ slightly from local computation due to these issues. Where they diverge, the local computation is more trustworthy.

## DealBot Quality Assurance

DealBot is the automated QA system for FOC. It continuously tests all registered SPs.

**What DealBot tests (per SP, continuously):**
- **Data Storage**: upload 10MB file, wait for on-chain confirmation (addPieces), check IPNI indexing and retrieval. 4 deals/SP/hour (96/day). Per-step timeouts: ingest 20s, onChain 60s, IPNI verify 60s, retrieval 20s, total check 180s.
- **IPFS Retrieval**: fetch previously stored file via SP's /ipfs gateway, validate DAG integrity. 4 retrievals/SP/hour. Timeouts: IPNI verify 10s, retrieval 20s, total check 30s.
- **Data Retention**: DealBot seeds 15 data sets per SP. The SPs must prove possession of this data each proving period. The number of challenges per proof is listener-dependent (currently 5 for FWSS). Retention results are tracked by get_proving_health (local proof-gap computation), not by DealBot's Prometheus metrics.

**SP Approval Acceptance Criteria** (from DealBot production-configuration-and-approval-methodology.md):

| Metric | Threshold | Minimum Sample | Source tool |
|--------|-----------|---------------|-------------|
| Data Storage Success Rate | >= 97% | 200 checks | get_dealbot_provider_detail (hours=72) |
| IPFS Retrieval Success Rate | >= 97% | 200 checks | get_dealbot_provider_detail (hours=72) |
| Data Retention Fault Rate | <= 0.2% | 500 proving periods | get_proving_health |

With 96 checks/day, an SP reaches 200-check minimums in ~2 days. Retention needs ~7 days (500 proving periods). These thresholds are for FWSS "approved" status. Endorsed status requires additional non-technical curation.

**DealBot maintenance windows** (checks paused): 07:00-07:20 UTC, 22:00-22:20 UTC.
**Hosting**: EU (dealbot.filoz.org). Latency metrics biased toward EU SPs. No strict latency requirements in approval criteria.

**Choosing the right time window for deal/retrieval metrics:**
- For **SLA pass/fail verdicts**: hours=72 (default). Gives ~288 deal checks (96/day x 3 days), exceeding the 200-check minimum. Always show sample counts alongside rates.
- For **trend analysis**: hours=168 (7d) or hours=720 (30d). Or use get_dealbot_daily for per-day time-series.
- For **regression detection**: compare hours=72 (recent) vs hours=720 (30d average).
- Time windows are quantized to: 1h, 6h, 12h, 24h, 72h, 7d, 30d, 90d. Inputs round up to the next tier. Cached 5-60min depending on window size.

**Interpreting deal/retrieval data:**
- Network-wide deal success rate (~26-33%) is misleadingly low because many registered providers are completely broken (0% success). Working providers typically achieve 82-96%.
- DealBot tests all registered providers equally (not just approved/endorsed). Filter by providerStatus for meaningful quality metrics.
- The get_dealbot_failures tool classifies errors from DealBot's own database: "fetch failed" = SP unreachable, 502 = backend down, "LockupNotSettledRateChangeNotAllowed" = payment contract issue.

**IPFS retrieval vs legacy retrieval - important distinction:**
The BetterStack-backed tools return ipfsRetrievalSuccessRate (active, use for SLA). The DealBot REST API also has a legacy retrievalSuccessRate field that tracked an older HTTP retrieval method - this may be frozen/stale and should NOT be used for SLA assessment. When assessing retrieval SLA (>= 97%), always use ipfsRetrievalSuccessRate.

**IPNI pipeline (available via DealBot REST API, not in BetterStack tools):**
IPNI (InterPlanetary Network Indexer) verification is tracked separately in DealBot's own database: indexed -> advertised -> verified. A provider can complete a deal but fail IPNI verification, making data unretrievable via content routing. Fields like ipniSuccessRate, totalIpniDeals are available through the DealBot web dashboard (dealbot.filoz.org) but not through the get_dealbot_* MCP tools. A provider with 95% deals but 0% IPNI is storing data but invisible to the network.

## Proving Fault Data - Three Sources, Different Accuracy

Three places to get fault/proving data:

1. **Local proof-gap computation** (get_proving_health, get_proving_dataset): PRIMARY. Computed from indexed PDPVerifier events. Detects faults by checking for missing PossessionProven events between consecutive NextProvingPeriod calls. Infers skipped periods when an SP goes dark (epoch gap > one proving period). Operator-agnostic (works for FWSS, Storacha, any listener). Derives proving period per-dataset from observed data. Use this for SLA retention assessment (<= 0.2%).

2. **PDP Explorer subgraph** (get_proving_health_goldsky, get_proving_dataset_goldsky): CROSS-VALIDATION. Independent computation via Goldsky-hosted subgraph. Has known issues (hardcoded proving period, isActive inflation, challenge count assumptions). Use to cross-check local results when accuracy is critical.

3. **On-chain fwss_fault_record** (query_sql): FWSS-ONLY supplementary data. Only fires for FWSS-operated datasets when nextProvingPeriod is called. Missing faults for Storacha and other operators. Useful for FWSS-specific investigation (when did faults start? which datasets? gas costs?) but NOT for aggregate fault rates.

4. **BetterStack/DealBot**: Deals and IPFS retrieval only. No retention/proving data.

**Cross-referencing across sources:**
- SP faulting in get_proving_health AND failing DealBot deals = systemic problem (SP likely down)
- SP clean in get_proving_health BUT failing DealBot deals = upload/network issue, not a proving problem
- SP faulting in get_proving_health BUT passing DealBot deals = proving-specific issue (gas, timing, or specific datasets)
- SP with zero proving periods in last 3 days AND no on-chain events = SP completely dead
- Local and Goldsky results diverge significantly = investigate specific datasets, may indicate subgraph bug or data gap

## Aggregate FilecoinPay Metrics (network-wide, all operators)

CRITICAL: For network-wide metrics, start from fp_* tables. Do NOT join to fwss_* tables -- that only captures FWSS-operated rails and misses other operators like Storacha (which accounts for ~74% of mainnet settlement volume).

**Total revenue**: SUM(total_net_payee_amount::numeric)/1e18 FROM fp_rail_settled. This is all USDFC paid to all SPs across all operators.
**Total revenue including one-time payments**: Add SUM(net_payee_amount::numeric)/1e18 FROM fp_one_time_payment.
**ARR (Annual Recurring Revenue)**: Use fp_rail_rate_modified (NOT fwss_rail_rate_updated which is FWSS-only). For active non-terminated non-finalized rails: SUM the latest new_rate per rail_id, multiply by epochs_per_year (2880 * 365). Or query live rail state via get_rail for each active rail.
**Revenue by operator**: JOIN fp_rail_settled to fp_rail_created on rail_id, GROUP BY operator. This shows FWSS vs Storacha vs other operators.
**Revenue by SP**: JOIN fp_rail_settled to fp_rail_created on rail_id, GROUP BY payee. Each payee is an SP address.
**Deposits/TVL**: fp_deposit and fp_withdrawal directly, no FWSS join needed.

Known operators on mainnet:
- FWSS: 0x8408502033c418e1bbc97ce9ac48e5528f371a9f
- Storacha: 0x56e53c5e7f27504b810494cc3b88b2aa0645a839
- Discover others: SELECT DISTINCT operator, COUNT(*) as rails FROM fp_rail_created GROUP BY operator

## Storacha (separate listener on shared infrastructure)

Storacha runs a fork of FWSS as a parallel listener contract on the SAME PDPVerifier and SAME FilecoinPay used by FilOz's FWSS. Their datasets, pieces, faults, and rate updates are tracked in storacha_fwss_* tables (mirror of the fwss_* schema). Their rails, settlements, and deposits are in fp_* tables shared with FWSS. Their proving periods and proofs are in pdp_* tables shared with FWSS.

**To query Storacha-specific data**: use storacha_fwss_* tables exactly the same way you'd use fwss_* tables. Schema is identical (dataSetId, payer, payee, etc.).

**To query Storacha settlements**: filter fp_rail_settled / fp_rail_created by operator = '0x56e53c5e7f27504b810494cc3b88b2aa0645a839' (mainnet) or '0x0c6875983b20901a7c3c86871f43fdee77946424' (calibnet). Same fp_* tables as FWSS, just different operator.

**To query Storacha proving health**: get_proving_health works for ALL providers regardless of which listener owns their datasets, because it uses pdp_* tables (shared) and the proof-gap method. Storacha SPs use did:key names in get_providers.

**Storacha-specific facts**: Their pricing is 0.9 USDFC/TiB/month (vs FWSS's 2.5). They do not use FilBeam (CDN tables fb_* will not have Storacha activity). They revert SP changes (storacha_fwss_data_set_sp_changed will be empty). They are version 1.1.0 of the FWSS contract; FilOz is on 1.2.0 -- the events are byte-identical between versions.

## FilBeam (incentivized data delivery / CDN)

FilBeam is the CDN / data delivery layer for FOC. Clients retrieve their stored content via FilBeam's global edge infrastructure; pay-per-byte billing is settled on-chain through a hybrid model (off-chain measurement, on-chain accounting). When a dataset is created with CDN enabled, FWSS creates two egress payment rails alongside the storage rail:

- **CDN rail** (payer -> FilBeam): pays FilBeam for content delivery from the edge cache. Covers TOTAL egress (cache hits + cache misses).
- **Cache-miss rail** (payer -> Storage Provider): compensates the SP when FilBeam has to fetch origin data from them. Covers ONLY the cache-miss bytes.

Pricing (immutable, FWSS constants, exposed via getServicePrice()): ~7 USDFC/TiB for CDN egress, ~7 USDFC/TiB for cache-miss egress. Maximum cost is ~14 USDFC/TiB if every request is a cache miss (both rails charge). Typical cost scales with cache-hit ratio. Per FilBeam docs: "up to $14 per TiB of egress". Storage pricing (2.5 USDFC/TiB/month) is separate and fires PricingUpdated events when changed; egress pricing does not change without a contract upgrade.

**On-chain contract**: FilBeamOperator. Non-upgradeable, redeployed to change rates or logic. Multiple historical addresses exist per network. It does NOT track per-request data -- only accumulated bytes per dataset. NOT used by Storacha (who run their own retrieval infrastructure).

**IMPORTANT: cdn_bytes_used is TOTAL egress (hits + misses), NOT just hits.** cache_miss_bytes_used is a SUBSET of cdn_bytes_used -- the portion that required an origin fetch from the SP. To compute cache hit ratio: 1 - (cache_miss_bytes_used / cdn_bytes_used). Do NOT add the two columns thinking they are disjoint totals. FilBeam's CDN rail is billed on total egress (cdn_bytes_used); the cache-miss rail is billed on the subset (cache_miss_bytes_used).

**Usage reporting schedule**: Mainnet = every 4 hours. Calibnet = every 30 minutes. Rollups cover up to the previous fully-finalized epoch. Reported only via UsageReported events (the fb_usage_reported table). Off-chain reporter key is the "controller" (updates tracked in fb_controller_updated).

**Important caveat**: Only traffic proxied through FilBeam is reported on-chain. If users retrieve content directly from SPs bypassing FilBeam, that traffic is NOT in fb_* tables. These tables represent billable FilBeam-proxied traffic, not all retrievals.

**Tables (fb_*)**:
- fb_usage_reported: bandwidth rollups (data_set_id, from_epoch, to_epoch, cdn_bytes_used, cache_miss_bytes_used). The bandwidth ledger.
- fb_cdn_settlement / fb_cache_miss_settlement: USDFC settled per rail (capped to lockupFixed of the rail).
- fb_payment_rails_terminated: FilBeam-initiated CDN service termination.
- fb_controller_updated: who can call recordUsageRollups (off-chain reporter authorization).
- fb_fwss_filbeam_controller_changed: handover between historical FilBeamOperator deployments.
- fb_ownership_transferred: FilBeamOperator owner changes.

**Joining to FWSS**: data_set_id is the join key. Bandwidth and settlements are PER DATASET, not per rail.

Example -- bytes served + USDFC settled per dataset: SELECT u.data_set_id, SUM(u.cdn_bytes_used) as cdn_bytes, SUM(u.cache_miss_bytes_used) as cm_bytes, (SELECT SUM(s.cdn_amount::numeric)/1e18 FROM fb_cdn_settlement s WHERE s.data_set_id = u.data_set_id) as cdn_paid, d.payer, d.provider_id FROM fb_usage_reported u JOIN fwss_data_set_created d ON u.data_set_id = d.data_set_id GROUP BY u.data_set_id, d.payer, d.provider_id

**Joining to FilecoinPay**: fwss_data_set_created.cdn_rail_id and .cache_miss_rail_id link to fp_rail_created.rail_id. The actual on-chain payment is recorded in fp_one_time_payment (not fp_rail_settled), since CDN rails use one-time payment mechanics.

**Multiple operator instances**: fb_* tables include an "operator" column with the contract address. Each historical FilBeamOperator deployment has its own address; if you want only the current operator, filter by the latest one (find via fb_fwss_filbeam_controller_changed.new_controller in the most recent row).

**Off-chain only data**: Per-request bandwidth is NOT on-chain. The smallest granularity is the rollup window between consecutive UsageReported events for a dataset. There is no per-client or per-region breakdown on-chain.

## Common Investigation Patterns

IMPORTANT: Cartesian product trap. Never join fwss_fault_record AND pdp_next_proving_period (or pdp_possession_proven) both independently to fwss_data_set_created in the same query. Both have multiple rows per data_set_id, so the join produces a cross product that inflates all counts. Always aggregate each table separately first using CTEs or subqueries, then join the aggregated results.

Correct pattern:
WITH faults AS (SELECT d.provider_id, SUM(f.periods_faulted) as total_faults FROM fwss_fault_record f JOIN fwss_data_set_created d ON f.data_set_id = d.data_set_id GROUP BY d.provider_id), proving AS (SELECT d.provider_id, COUNT(*) as proving_calls FROM pdp_next_proving_period p JOIN fwss_data_set_created d ON p.set_id = d.data_set_id GROUP BY d.provider_id) SELECT p.provider_id, p.proving_calls, COALESCE(f.total_faults, 0) as faults FROM proving p LEFT JOIN faults f ON p.provider_id = f.provider_id

**Provider health**: Join fwss_fault_record with fwss_data_set_created ON data_set_id to get provider_id. GROUP BY provider_id. Also call get_providers to get names and tiers. Check get_dataset_proving for live status of specific data sets. Always check for silent SPs by looking at MAX(timestamp) on pdp_next_proving_period grouped by data set.

**SLA assessment**: Three metrics from two sources:
- Deal success (>= 97%): get_dealbot_provider_detail with hours=72. Check sample count >= 200.
- IPFS retrieval success (>= 97%): same tool. Check sample count >= 200. Use ipfsRetrievalSuccessRate (NOT legacy retrievalSuccessRate).
- Retention fault rate (<= 0.2%): get_proving_health with the provider's EVM address. Use totalFaultedPeriods / totalProvingPeriods. Check totalProvingPeriods >= 500 for statistical validity.
Always show sample counts alongside rates.

**Settlement flow**: fp_rail_settled tracks settlement events. All amount fields (total_settled_amount, total_net_payee_amount, network_fee) are INCREMENTAL per event - SUM() them for totals. settled_up_to is the only cumulative field (monotonically increasing epoch). For FWSS-specific analysis, join with fwss_data_set_created (via rail IDs) to link settlements to data sets/providers. For network-wide totals, use fp_rail_settled directly or join to fp_rail_created for operator/payer/payee breakdown.

**Data set lifecycle (event sequence)**: fwss_data_set_created -> fwss_piece_added (pieces stored) -> pdp_next_proving_period + pdp_possession_proven (proving) -> fwss_fault_record (failures) -> fwss_service_terminated (termination requested, pdpEndEpoch set) -> [lockup period: SP keeps proving] -> fp_rail_finalized (rails zeroed after full settlement) -> pdp_data_set_deleted (SP cleans up, optional). Use get_dataset for current FWSS state (pdpEndEpoch, metadata, rails), get_dataset_proving for live PDPVerifier proving status, get_rail for rail endEpoch/settlement position.

**Silent SP detection**: Use get_proving_health - the subgraph tracks missed deadlines even when no events fire. If a provider has data sets where provenThisPeriod=false and nextDeadline is in the past, the SP is silently faulting. For on-chain investigation, query pdp_next_proving_period for each data set and compare MAX(timestamp) against current epoch minus one proving period.

**Partitioning by application**: The source column on fwss_data_set_created identifies which application created each data set (e.g. "filecoin-pin", "synapse-example"). To scope analysis to a specific dapp, filter WHERE source = 'filecoin-pin'. NULL source includes early data sets and apps that haven't adopted the source convention.

**Identifying DealBot data sets**: DealBot has two wallet addresses and three historical source metadata values. To reliably capture all DealBot traffic, filter by BOTH payer addresses:
- Legacy wallet (both networks): 0xa5F90bc2AA73a2E0Bad4D7092a932644d5dD5d71
- Current multisig (both networks, from April 2026): 0x305025D07c1DEe47F25a4990179eFf2becddCA0B
- Source metadata history: NULL (early datasets), "filecoin-pin" (due to a metadata override bug, ~Mar 2026), "dealbot" (current, from April 2026 onward)
- To include all DealBot data: WHERE payer IN ('0xa5f90bc2aa73a2e0bad4d7092a932644d5dd5d71', '0x305025d07c1dee47f25a4990179eff2becddca0b')
- To exclude all DealBot data: WHERE payer NOT IN ('0xa5f90bc2aa73a2e0bad4d7092a932644d5dd5d71', '0x305025d07c1dee47f25a4990179eff2becddca0b')
- Do NOT rely on source metadata alone to identify DealBot datasets due to the historical inconsistency.

**Session keys for a signer**: The same identity+signer pair can be updated multiple times. To find currently active session keys, take the latest event per identity+signer and check expiry against the current epoch:
WITH latest AS (SELECT DISTINCT ON (identity, signer) * FROM skr_authorizations_updated WHERE signer = '0x...' ORDER BY identity, signer, block_number DESC) SELECT * FROM latest WHERE expiry > CURRENT_EPOCH
The permissions field is a JSON array of bytes32 hashes representing the scopes the session key is authorized for.

**Transaction types and gas analysis**: Data set operations come in three forms, identifiable by which events share a tx_hash:
1. **Standalone createDataSet**: pdp_data_set_created + fwss_data_set_created + fp_rail_created (3+ rails) in one tx. No pdp_pieces_added in the same tx.
2. **Standalone addPieces**: pdp_pieces_added + fwss_piece_added (one per piece) + fwss_rail_rate_updated in one tx. No pdp_data_set_created in the same tx.
3. **Combined create+add** (default Synapse SDK path): pdp_data_set_created + fwss_data_set_created + fp_rail_created + pdp_pieces_added + fwss_piece_added + fwss_rail_rate_updated ALL in one tx. This is what happens when addPieces is called with dataSetId=0, PDPVerifier creates the data set first, then adds pieces, triggering both FWSS callbacks in sequence.

To identify the operation type: JOIN pdp_data_set_created and pdp_pieces_added ON tx_hash. If both exist in the same tx, it's a combined create+add. The gas cost of the transaction (gas_used * effective_gas_price) covers the entire operation.

For gas analysis: use gas_used and effective_gas_price from any event in the transaction (all events in a tx share the same receipt). Piece count (pdp_pieces_added.piece_count) strongly affects gas, batch addPieces with 100 pieces costs much more than 1 piece. Group by piece_count ranges for meaningful averages.

**Total data stored**: SUM(raw_size) from fwss_piece_added gives total bytes of original (unpadded) data. Divide by 1e12 for TiB. Filter by provider via JOIN with fwss_data_set_created. Exclude terminated datasets by LEFT JOIN with fwss_service_terminated and filtering WHERE terminated IS NULL.

**Total revenue**: SUM(total_net_payee_amount) / 1e18 from fp_rail_settled gives all-time USDFC paid to SPs. Join with fwss_data_set_created via pdp_rail_id for per-provider breakdown. Remember: these fields are INCREMENTAL per event, so SUM() is correct.

**Time filtering**: Use timestamp column (unix seconds). Last 7 days: WHERE timestamp > EXTRACT(EPOCH FROM NOW()) - 7*86400. By date: WHERE TO_TIMESTAMP(timestamp) >= '2026-03-01'. By epoch: WHERE block_number > 5860000.

**Tool selection**:
- "What is the current state of X?" -> get_dataset, get_rail, get_provider (live eth_call, always current)
- "What happened historically?" -> query_sql (indexed events, full history)
- "How healthy is provider X?" -> get_dealbot_provider_detail (deals/retrieval) + get_proving_health (proving faults)
- "Why is X failing?" -> get_dealbot_failures (error classification) + query_sql for specific events

**Stuck settlements**: Rails where settledUpTo is far behind the current epoch. Join fp_rail_settled with fp_rail_created to find rails with no recent settlement. Could indicate a stuck validator, underfunded payer, or open proving period blocking progress.

## HTTP API for Building Live Dashboards

The FOC Observer API at {{BASE_URL}} is a public, unauthenticated REST API with CORS enabled. You can build browser-based dashboards and interactive pages that fetch live data directly from this API using fetch(). No API key or authentication needed.

**Base URL**: {{BASE_URL}}

**On-chain data endpoints** (backed by Ponder-indexed Postgres):

POST /sql
  Body: { "network": "calibnet", "sql": "SELECT ..." }
  Returns: { "network": "calibnet", "columns": ["col1", ...], "rows": [{ "col1": "val", ... }], "rowCount": N }
  Only SELECT/WITH/EXPLAIN queries allowed. Read-only. EXPLAIN ANALYZE is blocked.
  Maximum 10,000 rows returned per query. If truncated, response includes "truncated": true and "totalRows".
  Postgres system catalogs (pg_shadow, pg_catalog, information_schema, etc.) are blocked.
  Use your own LIMIT clauses for large tables. For aggregation, GROUP BY reduces row count naturally.
  Query timeout is 120 seconds. If a query times out, try: add LIMIT, narrow the timestamp range, avoid self-joins on large tables.
  Large tables (100k+ rows): fwss_piece_added, fwss_fault_record, fp_rail_settled, fp_rail_rate_modified, pdp_next_proving_period, pdp_possession_proven.
  Self-joins on these tables will likely time out. Use GROUP BY with aggregate functions instead. For piece duplication analysis, GROUP BY piece_cid is efficient; self-joining fwss_piece_added is not.
  Indexed columns (fast to filter on): data_set_id, provider_id, rail_id, set_id, payer, payee, piece_cid (on fwss_piece_added), timestamp, source (on fwss_data_set_created).

GET /status
  Returns: [{ "name": "calibnet", "tables": 28, "totalRows": N, "reachable": true, ... }, ...]

GET /tables/:network
  Returns: { "network": "calibnet", "tables": [{ "name": "fwss_fault_record", "rowCount": N, "description": "..." }, ...] }

GET /table/:network/:name
  Returns: { "network": "calibnet", "table": "fwss_fault_record", "columns": [{ "name": "data_set_id", "type": "numeric", "nullable": false }, ...] }

**Live contract state endpoints** (backed by Lotus RPC eth_call):

GET /providers/:network
  Returns: { "network": "calibnet", "providers": [{ "providerId": "2", "name": "ezpdpz-calib2", "isActive": true, "isApproved": true, "isEndorsed": false, ... }, ...] }

GET /provider/:network/:id
  Returns: { "network": "calibnet", "providerId": "2", "name": "ezpdpz-calib2", ... }

GET /dataset/:network/:id
  Returns: { "network": "calibnet", "dataSetId": "11141", "providerId": "6", "metadata": { "source": "dealbot" }, ... }

GET /dataset/:network/:id/proving
  Returns: { "network": "calibnet", "live": true, "provenThisPeriod": false, "provingDeadline": "3543000", ... }

GET /rail/:network/:id
  Returns: { "network": "calibnet", "railId": "13602", "paymentRateFormatted": "0.000000694 USDFC/epoch", ... }

GET /pricing/:network
  Returns: { "network": "calibnet", "storagePriceFormatted": "2.5 USDFC/TiB/month", ... }

GET /auction/:network/:token
  Returns: { "network": "mainnet", "accumulatedFeesFormatted": "0.90 USDFC", "networkFeePercent": "0.50%", ... }
  Token is the ERC-20 address (USDFC or FIL). Shows current fee auction state.

GET /account/:network/:token/:owner
  Returns: { "network": "mainnet", "funds": "...", "lockupCurrent": "...", "availableFunds": "...", "fundedUntilEpoch": "...", ... }
  Token + owner address. Shows balance, lockup, solvency.

**Deal/retrieval metrics endpoints** (backed by BetterStack ClickHouse Prometheus data):

GET /metrics/providers/:network?hours=72
  Returns: { "network": "calibnet", "hours": 72, "providers": [{ "providerId": "2", "dealSuccessRate": 95.5, "ipfsRetrievalSuccessRate": 98.2, ... }, ...] }

GET /metrics/provider/:network/:id?hours=72
  Returns: { "network": "calibnet", "hours": 72, "providerId": "2", "dealSuccessRate": 95.5, ... }

GET /metrics/network/:network?hours=72
  Returns: { "network": "calibnet", "hours": 72, "totalDeals": 1500, "dealSuccessRate": 45.2, ... }

GET /metrics/providers/:network?hours=168&bucket=24h
  Returns: { "network": "calibnet", "hours": 168, "bucket": "24h", "data": [{ "bucket": "2026-03-14 00:00:00", "providerId": "2", ... }, ...] }

**Proving health endpoints** (backed by PDP Explorer subgraph via Goldsky GraphQL):

GET /proving/providers/:network
  Returns: { "network": "calibnet", "providers": [{ "address": "0x...", "totalFaultedPeriods": 127669, "totalProvingPeriods": 1196637, "faultRate": 10.67, ... }, ...] }

GET /proving/provider/:network/:address?weeks=4
  Returns: { "network": "calibnet", "provider": { "address": "0x...", "faultRate": 10.67, ... }, "weeklyActivity": [...], "datasets": [...] }

GET /proving/dataset/:network/:setId
  Returns: { "network": "calibnet", "setId": "11141", "isActive": true, "provenThisPeriod": false, "totalFaultedPeriods": 424, ... }

**DealBot API (direct, for agent queries):**

When YOU are querying DealBot data (via MCP tools or direct analysis), the MCP tools call DealBot directly. For reference, the direct DealBot API endpoints are:

Mainnet base: https://dealbot.filoz.org/api
Calibnet base: https://staging.dealbot.filoz.org/api

GET /v1/metrics/network/stats - network-wide quality metrics
GET /v1/providers/metrics?limit=100 - all providers with weekly + all-time health scores
GET /v1/providers/metrics/:spAddress/window?preset=7d - single provider time window (presets: 1h, 6h, 12h, 24h, 72h, 3d, 7d, 30d, 90d)
GET /v1/metrics/daily/recent?days=7 - daily trend metrics
GET /v1/metrics/failed-deals/summary - deal failure analysis
GET /v1/metrics/failed-retrievals/summary - retrieval failure analysis

**DealBot proxy endpoints (for browser dashboards):**

DealBot's own API blocks cross-origin browser requests (same-origin policy). When building client-side dashboards or standalone HTML, use these CORS-enabled proxies on the FOC Observer API instead:

GET /dealbot/stats/:network
GET /dealbot/providers/:network
GET /dealbot/provider/:network/:addr?preset=7d
GET /dealbot/daily/:network?days=7
GET /dealbot/failures/:network

All return JSON with a "network" field. Same data, different origin.

## Block Explorers

Use these to link transaction hashes to block explorer pages:

Calibnet: https://filecoin-testnet.blockscout.com/tx/{txHash}
Mainnet:  https://filecoin.blockscout.com/tx/{txHash}

Alternative explorers:
- Filfox: https://calibration.filfox.info/en/tx/{txHash} (calibnet), https://filfox.info/en/tx/{txHash} (mainnet)
- Beryx: https://beryx.io (supports both networks)

Blockscout is the default explorer in the FOC SDK stack.

## Transaction and Event Metadata

All event tables include these standard columns alongside event-specific fields:
- id: {blockHash}-{logIndex} (unique event identifier)
- tx_hash: transaction hash (use for block explorer links)
- tx_from: transaction sender address (the wallet that submitted the transaction)
- tx_value: FIL value sent with the transaction (bigint, 18 decimals. Usually 0 for contract calls, non-zero for payable functions like createDataSet which charges a proof fee)
- gas_used: actual gas consumed by the transaction (from receipt)
- effective_gas_price: price per gas unit in attoFIL (from receipt)
- block_number: Filecoin epoch
- timestamp: unix seconds

Gas cost in FIL = gas_used * effective_gas_price / 1e18. To analyze gas costs:
- Per-operation: SELECT gas_used * effective_gas_price / 1e18 as gas_cost_fil FROM table
- Per-provider proving cost: SUM(gas_used * effective_gas_price) from pdp_next_proving_period JOIN fwss_data_set_created
- Network-wide daily gas: GROUP BY DATE_TRUNC('day', TO_TIMESTAMP(timestamp)) with SUM(gas_used * effective_gas_price)
- Compare proving vs settlement vs data set creation gas costs to understand where gas budget goes

To link to a block explorer: use tx_hash with the explorer URL templates (see Block Explorers section).
For the fp_burn_for_fees table, the id format is {blockHash}-{transactionIndex} (indexed from transactions, not events).

## Building Dashboards and Applications

### Data conventions for display
- Amounts: bigint strings with 18 decimals. Divide by 1e18 for human-readable USDFC/FIL.
- Timestamps: unix seconds in database. Use new Date(timestamp * 1000) in JavaScript.
- Epochs: Filecoin block heights. Each epoch is ~30 seconds. To convert epoch to approximate date: new Date((epoch * 30 + genesisTimestamp) * 1000).

### Tool approval in Claude.ai
If a tool call returns "No approval received", this means the user hasn't clicked the approve button in the Claude.ai UI. This is a Claude.ai UX issue, not an MCP error. Ask the user to approve the tool call, or retry.

### Data fidelity note
The get_dealbot_stats/providers/provider_detail/daily tools are backed by BetterStack Prometheus counter data. Sample counts may be ~10-15% lower than DealBot's actual database counts due to Prometheus counter aggregation across pod restarts. Success RATES are accurate; absolute counts are slightly understated. For authoritative absolute counts, the DealBot web dashboard at dealbot.filoz.org is the source of truth.

### Deployment contexts

**Claude.ai artifacts (sandboxed iframe):**
Artifacts in claude.ai run in a sandboxed iframe with a strict CSP that only allows requests to CDN domains (cdnjs.cloudflare.com, esm.sh, cdn.jsdelivr.net, unpkg.com). Direct fetch() to the FOC Observer server or any external API is blocked by CSP. To build live artifacts, route requests through the Anthropic API with this MCP server attached. Use sequential (not parallel) requests to avoid concurrency rate limits. Expect ~10s per MCP tool call.

**Standalone HTML (downloaded, opened locally):**
Direct fetch() to the FOC Observer REST API works from any local browser context. CORS is enabled on all endpoints. Use the /dealbot/* proxy endpoints for DealBot data (DealBot's own API blocks cross-origin requests).

**Hosted web application:**
Same as standalone. All data available from one CORS-enabled origin (the FOC Observer server). Use /sql for analytics, /providers for directory, /dealbot/* for quality metrics. No authentication required.

### Minimal fetch example
\`\`\`javascript
// Query on-chain fault data
const res = await fetch('{{BASE_URL}}/sql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    network: 'calibnet',
    sql: "SELECT provider_id, COUNT(*) as faults FROM fwss_fault_record GROUP BY provider_id"
  })
});
const { columns, rows } = await res.json();

// Get provider names
const provRes = await fetch('{{BASE_URL}}/providers/calibnet');
const { providers } = await provRes.json();

// Get DealBot metrics (via proxy)
const dbRes = await fetch('{{BASE_URL}}/dealbot/stats/calibnet');
const stats = await dbRes.json();
\`\`\``
