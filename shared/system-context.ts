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

**"How healthy are providers?"** -> Deal/retrieval rates: get_dealbot_providers, get_dealbot_provider_detail. Proving fault rate: get_proving_health (authoritative, includes silent faults). Error analysis: get_dealbot_failures.

**Default to mainnet** unless the user asks about calibnet. Both are fully indexed.

## The Stack (layered, not monolithic)

FOC is a layered system. The foundation is generic; service contracts are opinionated applications on top.

**Foundation (generic, service-agnostic):**
- **FilecoinPay**: Payment rails, streaming and one-time. Any service can build on it.
- **PDPVerifier**: Proof of Data Possession, neutral proof protocol. No business logic. Calls service contracts via callbacks.
- **ServiceProviderRegistry**: SP registration, names, capabilities, product metadata.
- **SessionKeyRegistry**: Scoped delegation keys for reduced-friction operations.

**Service contracts (opinionated applications):**
- **FWSS (FilecoinWarmStorageService)**: The current warm storage service. Creates 3 payment rails per dataset (PDP, CDN, cache-miss), validates proving, manages pricing. FWSS is the operator and validator on PDP rails. Other services will follow (PoRep, cold storage, etc.)
- **ProviderIdSet**: Curated endorsed provider set, maintained by FilOz.

**Provider tiers** (each a subset of the previous):
1. **Registered** (isActive): in ServiceProviderRegistry. Any SP can register.
2. **Approved** (isApproved): passes DealBot quality checks. Can be secondary copy target.
3. **Endorsed** (isEndorsed): curated highest-trust set. Primary copy target for the SDK.

## Key Terms

- **Data Set**: Pieces stored by one SP for one client. Has dataSetId, 3 payment rails.
- **Rail**: Payment channel (railId, payer, payee, rate, lockup). endEpoch > 0 = terminated.
- **Proving period**: SP must prove data possession each period (calibnet ~2h, mainnet ~24h). 5 challenges per dataset per period. Missing the 20-epoch challenge window = fault.
- **FaultRecord**: Fires only when nextProvingPeriod is called with missed proof. Silent SPs produce NO fault events.
- **Operator**: Contract that manages rails (FWSS for FOC). Validator: arbiter during settlement (FWSS checks proofs on PDP rails; CDN rails have no validator).
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
- Dataset metadata: "source" identifies creating app (e.g. "filecoin-pin"). Indexed column. DealBot wallet: 0xa5F90bc2AA73a2E0Bad4D7092a932644d5dD5d71 (use payer address to filter, not source).
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

**Rail lifecycle**: Active (endEpoch=0) -> Terminated (endEpoch>0) -> Finalized (data zeroed, getRail reverts)

**Key fields from getRail()**:
- paymentRate: USDFC per epoch (18 decimals). This is the streaming rate.
- lockupPeriod: epochs of guaranteed payment after termination. FWSS uses 86400 (30 days), other service contracts may use different values.
- lockupFixed: reserved for one-time payments (CDN usage). 0 for PDP rails.
- settledUpTo: last epoch for which payment has been processed. If < current epoch, settlement is pending.
- endEpoch: 0 = active rail. > 0 = terminated at this epoch.
- commissionRateBps: basis points taken as service commission. FWSS currently sets this to 0 for all rails.
- validator: address(0) = no validator (CDN rails). FWSS address = PDP rail (proof-validated settlement).

**Lockup is NOT a pre-payment**: While a rail is active, payments come from the payer's general funds. The lockup acts as a floor preventing withdrawals. After termination, lockup becomes the actual payment source - it guarantees the payee receives payment for the lockup period (30 days). This is the "safety hatch" pattern.

**Settlement mechanics**: settleRail() moves funds from payer to payee. For PDP rails, FWSS.validatePayment() is called, which checks whether proofs were submitted. Proven periods get full payment. Faulted periods (deadline passed, no proof) get zero payment but settlement still advances. Open periods (deadline not yet passed) block settlement.

**Rate changes**: Create segments in a queue. Settlement processes each segment with the rate that applied during that time period. Adding pieces triggers immediate rate increase. Removing pieces defers rate decrease to next proving period boundary.

**Terminated but not finalized**: After termination, the rail is still "active" in the sense that settlement continues during the lockup period. The SP must keep proving. Only after full settlement does finalization zero out the rail data.

## FWSS Data Sets

**Data set = data stored by one SP for one client**. Created via PDPVerifier.createDataSet() which calls FWSS.dataSetCreated(). FWSS creates 3 FilecoinPay rails atomically:
1. PDP rail: streaming payment for storage. FWSS is both operator and validator.
2. CDN rail: one-time payments for bandwidth. No validator. rate=0, uses lockupFixed.
3. Cache-miss rail: one-time payments for origin fetches. No validator.

**Data set state from get_dataset()**:
- pdpEndEpoch > 0 means the data set is terminated (service ending). The SP must continue proving during the lockup period.
- metadata["source"] identifies the creating application. "dealbot" = automated testing. Filter this for organic metrics.
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

**Per-provider revenue**: JOIN fp_rail_settled with fwss_data_set_created ON rail_id = pdp_rail_id to link settlements to providers. GROUP BY provider_id for per-SP revenue.

**Per-ERC20**: Filter any fp_* table by the token column. fp_rail_created.token identifies the currency. fp_deposit.token and fp_withdrawal.token show token-specific flows.

**Commission breakdown**: Each fp_rail_settled event has totalSettledAmount (gross for this settlement), totalNetPayeeAmount (to SP), operatorCommission (to FWSS, currently 0), networkFee (burned/auctioned). Per-event split: gross = net + commission + fee. SUM() each field across events for totals.

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
- Source: PDP Explorer subgraph hosted on Goldsky (public GraphQL, no auth).
- How: The subgraph indexes PDPVerifier contract events and also tracks proving period deadlines. When a deadline passes without a proof submission, the subgraph records a fault - even if no on-chain event was emitted (a "silent fault"). This is the key difference from on-chain fwss_fault_record data.
- Fields: totalFaultedPeriods (distinct periods missed), totalProvingPeriods (total periods elapsed), faultRate (faulted/total as percentage). Weekly breakdown includes per-week faults, proofs, data added/removed.
- Calculation: faultRate = totalFaultedPeriods / totalProvingPeriods * 100. This counts actual distinct missed periods, not consecutive-miss counts like on-chain periodsFaulted.
- Endpoint: calibnet at api.goldsky.com/.../pdp-explorer/calibration311a/gn, mainnet at .../mainnet311b/gn.
- Limitation: All-time aggregates only (no time-windowed queries). Weekly/monthly breakdowns are pre-aggregated by the subgraph.

## DealBot Quality Assurance

DealBot is the automated QA system for FOC. It continuously tests all registered SPs.

**What DealBot tests (per SP, continuously):**
- **Data Storage**: upload 10MB file, wait for on-chain confirmation (addPieces), check IPNI indexing and retrieval. 4 deals/SP/hour (96/day). Per-step timeouts: ingest 20s, onChain 60s, IPNI verify 60s, retrieval 20s, total check 180s.
- **IPFS Retrieval**: fetch previously stored file via SP's /ipfs gateway, validate DAG integrity. 4 retrievals/SP/hour. Timeouts: IPNI verify 10s, retrieval 20s, total check 30s.
- **Data Retention**: DealBot seeds 15 data sets per SP. The SPs must prove possession of this data each proving period (5 challenges/data set/day on mainnet = 75 daily proof challenges per SP). Retention results are tracked by the PDP Explorer subgraph, not by DealBot's Prometheus metrics.

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

Three places to get fault/proving data, each with different completeness:

1. **PDP Explorer subgraph** (get_proving_health, get_proving_dataset): AUTHORITATIVE. The subgraph watches proving period deadlines and records a fault when a deadline passes without proof submission - including "silent faults" where the SP never called nextProvingPeriod (no on-chain event). totalFaultedPeriods / totalProvingPeriods gives the true fault rate. Use this for SLA retention assessment (<= 0.2%).

2. **On-chain fwss_fault_record** (query_sql): Only captures faults where nextProvingPeriod was actually called. Silent SPs produce NO fault events. The periodsFaulted field counts consecutive misses per FaultRecord event, which can exceed actual distinct missed periods (e.g. 20 consecutive misses = one event with periodsFaulted=20, but the subgraph counts it as 20 faulted periods). Use for historical investigation (when did faults start? which data sets? what gas was spent?) but NOT for SLA fault rate.

3. **BetterStack/DealBot**: Deals and IPFS retrieval only. No retention/proving data. The dataSetChallengeStatus Prometheus metric was removed from our queries because it produced misleading fleet-wide numbers.

Never substitute on-chain fault calculations for subgraph data in SLA assessments. The subgraph is the source of truth for "how many proving periods did this SP miss?"

**Cross-referencing across sources:**
- SP faulting in subgraph AND failing DealBot deals = systemic problem (SP likely down)
- SP clean in subgraph BUT failing DealBot deals = upload/network issue, not a proving problem
- SP faulting in subgraph BUT passing DealBot deals = proving-specific issue (gas, timing, or specific data sets)
- SP silent in subgraph (zero proving periods) AND no on-chain events = SP completely dead

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

**Settlement flow**: fp_rail_settled tracks settlement events. All amount fields (total_settled_amount, total_net_payee_amount, network_fee) are INCREMENTAL per event - SUM() them for totals. settled_up_to is the only cumulative field (monotonically increasing epoch). Join with fwss_data_set_created (via rail IDs) to link settlements to data sets/providers.

**Data set lifecycle**: fwss_data_set_created -> fwss_piece_added (pieces stored) -> pdp_possession_proven (proofs) -> fwss_fault_record (failures) -> fwss_service_terminated (ended). Use get_dataset for current state, get_dataset_proving for live proving status.

**Silent SP detection**: Use get_proving_health - the subgraph tracks missed deadlines even when no events fire. If a provider has data sets where provenThisPeriod=false and nextDeadline is in the past, the SP is silently faulting. For on-chain investigation, query pdp_next_proving_period for each data set and compare MAX(timestamp) against current epoch minus one proving period.

**Partitioning by application**: The source column on fwss_data_set_created identifies which application created each data set (e.g. "filecoin-pin", "synapse-example"). To scope analysis to a specific dapp, filter WHERE source = 'filecoin-pin'. NULL source includes early data sets and apps that haven't adopted the source convention. Do NOT use source to identify DealBot data sets - DealBot's source value varies over time. To reliably isolate DealBot traffic, filter by the DealBot payer wallet address:
- Mainnet and calibnet: 0xa5F90bc2AA73a2E0Bad4D7092a932644d5dD5d71
Example: SELECT * FROM fwss_data_set_created WHERE payer != '0xa5f90bc2aa73a2e0bad4d7092a932644d5dd5d71' - excludes DealBot Example: SELECT source, COUNT(*) as datasets, SUM(piece_count) as pieces FROM fwss_data_set_created d LEFT JOIN (SELECT data_set_id, COUNT(*) as piece_count FROM fwss_piece_added GROUP BY data_set_id) p ON d.data_set_id = p.data_set_id GROUP BY source.

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
