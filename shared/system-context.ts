/**
 * Domain knowledge for FOC observability.
 *
 * The server supplies INSTRUCTIONS at initialization and returns SYSTEM_CONTEXT
 * in one tool call. Hosts decide which initialization instructions to show.
 */

function resolveUrl(baseUrl?: string): string {
  const url = baseUrl ?? process.env.FOC_API_URL
  if (!url) throw new Error("FOC_API_URL environment variable is required (or pass baseUrl to resolveSystemContext)")
  return url.replace(/\/+$/, "")
}

/** Resolve literal {{BASE_URL}} markers without replacement-string interpolation. */
export function resolveSystemContext(baseUrl?: string): { instructions: string; systemContext: string } {
  const url = resolveUrl(baseUrl)
  return {
    instructions: INSTRUCTIONS.replace(/\{\{BASE_URL\}\}/g, () => url),
    systemContext: SYSTEM_CONTEXT.replace(/\{\{BASE_URL\}\}/g, () => url),
  }
}

export const INSTRUCTIONS = `FOC (Filecoin Onchain Cloud) is a Filecoin storage-services marketplace. Clients pay storage providers (SPs); FilecoinPay moves funds and PDPVerifier verifies possession.

## Start here
1. Call get_system_context once before analytical work.
2. Pass i_have_read_the_system_context=true to analytical tools. Simple lookups (get_providers, get_provider, get_pricing, list_tables, describe_table, get_status) do not need it.
3. Default to mainnet unless asked for calibnet.

## Select the source
- Current state: get_providers, get_dataset, get_dataset_proving, get_rail, get_account, get_pricing, get_auction. A finalized rail makes get_rail revert by design.
- History: query_sql over indexed events. Use list_tables and describe_table first when the schema is uncertain.
- Provider quality: get_proving_health is primary for retention; get_proving_health_goldsky cross-checks it. DealBot tools measure deals and IPFS retrieval, not possession proofs.
- Contract behaviour: read deployed source/specs. Events show what occurred, not what calls are permitted.

## Stack
Foundation: FilecoinPay (streaming and one-time rails), PDPVerifier (listener-neutral proofs), ServiceProviderRegistry (provider products), SessionKeyRegistry (scoped delegation).

FWSS is FilOz's warm-storage listener and FilecoinPay operator. Each dataset always has one PDP storage rail; it has CDN and cache-miss rails only when created with the CDN add-on. Both egress rails are absent otherwise. FWSS mainnet operator: 0x8408502033c418e1bbc97ce9ac48e5528f371a9f. Its events are fwss_*.

Storacha was a separate FWSS v1.2.x fork on the same FilecoinPay and PDPVerifier. It wound down 2026-04-19. Use storacha_fwss_* for its historical service events and its own operator address for fp_* attribution. Its providers use did:key names.

FilBeam is a non-upgradeable CDN bandwidth ledger. It records aggregate CDN and cache-miss bytes then settles FWSS's optional egress rails with FilecoinPay one-time payments. It has multiple historical addresses and is not used by Storacha.

FilecoinPay and PDPVerifier are operator/listener agnostic. For market-wide payments start at fp_*; joining fwss_* excludes other services. fp_rail_created.operator identifies the operator. A PDP set unmatched to indexed service creations has an unknown listener.

## Terms and conventions
- Registration, approval and endorsement are separate flags. FWSS checks registry membership at creation; the SDK uses curated providers for copy selection. Resolve IDs with get_providers and display Name (ID).
- A rail has payer, payee, token, rate, lockup and endEpoch. endEpoch=0 is active. Lockup restricts withdrawal; it is not a prepayment. A terminated rail pays from its lockup until finalization.
- Amounts are bigint base units. Never assume a token or 18 decimals from table names: group by fp_rail_created.token and scale with that token's decimals. Native FIL is address(0). USDFC is 18 decimals, but later FWSS storage terms can choose another token and precision. Tokens are not interchangeable USD amounts.
- block_number is Filecoin epoch (about 30 seconds); timestamp is Unix seconds. Addresses and hashes are lowercase in SQL.
- raw_size is original bytes; leaf_count is FR32-expanded 32-byte leaves. A TiB is 2^40 bytes, a TB 10^12.
- fwss data_set_id and PDP set_id are the same value.
- Total paid includes streaming settlements AND one-time payments. Compare amounts within each token; axlUSDC uses 6 decimals.
- Silent providers may emit no faults. For retention, inspect recent period boundaries and proofs rather than counting FWSS FaultRecord rows alone.

## Source and references
Use released/deployed code for rules, especially across version boundaries:
- FilecoinPay: https://raw.githubusercontent.com/FilOzone/filecoin-pay/main/SPEC.md
- FWSS v1.6.0 SPEC: https://raw.githubusercontent.com/FilOzone/filecoin-services/v1.6.0/SPEC.md
- FWSS source at deployed release: https://github.com/FilOzone/filecoin-services/tree/v1.6.0/service_contracts/src
- PDPVerifier: https://raw.githubusercontent.com/FilOzone/pdp/main/README.md
- Deployments: https://github.com/FilOzone/filecoin-services/blob/main/service_contracts/deployments.json
- Release evidence and execution receipts: https://github.com/FilOzone/filecoin-services/releases
- REST API: {{BASE_URL}}`
export const SYSTEM_CONTEXT = `# FOC Protocol Mechanics

Use the network and release at the epoch in question. FWSS service rules do not apply to every PDP listener or FilecoinPay operator. The specs describe rules; events show observed behavior. Use deployed source: https://github.com/FilOzone/filecoin-services/tree/v1.6.0/service_contracts/src/modules (FWSS), https://github.com/FilOzone/pdp (proofs), https://github.com/FilOzone/filecoin-pay/blob/main/SPEC.md (rails), https://github.com/FilOzone/SessionKeyRegistry (delegation).

## Payment Rails (FilecoinPay)

A rail is a payment channel: payer -> payee, managed by an operator, optionally arbitrated by a validator.

## Dataset and Rail Lifecycle

Three layers of lifecycle state. Understanding these is critical for correct queries.

**PDPVerifier layer**: dataSetLive requires an allocated ID, nonzero storageProvider and no cleanup underway. Deletion makes the set non-live before cleanup necessarily clears its provider/storage. IDs are never reused. PDP liveness and FWSS termination are separate.

**FWSS service lifecycle:**

Dataset state machine:
- **Active** (pdpEndEpoch=0): pieces being stored, SP proving, settlement via validatePayment. New pieces can be added.
- **Terminated/Lockup** (pdpEndEpoch > 0, pdpEndEpoch > current epoch): Service is ending but lockup period is running. SP must continue proving (gets paid for proven periods, zero for faults). No new pieces can be added. Piece removals still allowed.
- **Post-Lockup** (pdpEndEpoch > 0, pdpEndEpoch <= current epoch): Lockup expired. No more proving. Settlement completes to endEpoch.
- **Finalized**: All rails settled and zeroed (getRail reverts). Dataset still exists in PDPVerifier.
- **Deleted**: PDP set no longer live; storage cleanup may continue. Normal FWSS termination is marked by fwss_service_terminated. On abandonment after the inactivity window, a third party can call deleteDataSet and FWSS emits fwss_data_set_abandoned instead (v1.3+).

**pdpEndEpoch is the epoch when payment obligation ends, not when termination was requested.** For unilateral termination by a fully funded payer or its SP: pdpEndEpoch = termination_block + lockup_period (86400 epochs = 30 days). For an underfunded payer: pdpEndEpoch = last_funded_epoch + lockup_period (could be closer to or even before the current epoch).

**Rail lifecycle (FilecoinPay layer)**:
- Active (endEpoch=0): streaming payments at paymentRate.
- Terminated (endEpoch > 0): on ordinary termination, endEpoch = lockupLastSettledAt + lockupPeriod. Signed immediate FWSS termination can shorten it. Not block.number + lockupPeriod.
  - endEpoch in the future: lockup running, settlement continues up to current epoch
  - endEpoch in the past: lockup expired, final settlement to endEpoch, then auto-finalization
- Finalized: all rail data zeroed. getRail() reverts. Unused lockupFixed returned to payer.

**getRail()**: paymentRate is rail-token base units/epoch; lockupPeriod is epochs (FWSS PDP: 86,400). lockupFixed holds one-time funds, including the PDP lifecycle reserve. settledUpTo is cumulative. endEpoch=0 is active. FWSS validates the PDP rail; the optional CDN rails have validator=address(0).

**Lockup is not a pre-payment**: While active, payments come from payer's general funds. Lockup is a withdrawal floor: it prevents the payer from withdrawing below the lockup amount, but it does not guarantee the funds are actually there. A payer can be "delinquent" (underfunded) if their balance is below the lockup requirement; settlement halts and lockupLastSettledAt stops advancing. After termination, lockup becomes the payment source. If fully funded at termination time, the SP gets the full 30-day guarantee. If underfunded, the guarantee is shorter (endEpoch = last_funded_epoch + lockupPeriod, which may be closer to or even before the current epoch).

**Settlement**: settleRail() moves funds payer->payee. For PDP rails, FWSS.validatePayment() checks proofs: proven=full payment, faulted=zero, open period=blocked. Escape hatch: settleTerminatedRailWithoutValidation (payer-only, after endEpoch passes) bypasses a stuck validator.

**PDPVerifier v3.5.0 removal**: schedulePieceDeletions emits PiecesScheduledForRemoval; scheduling alone leaves an existing challenge usable. processPieceDeletions emits PiecesRemoved and clears nextChallengeEpoch. Proving can resume after nextProvingPeriod, which rejects a nonempty queue. DataSetEmpty fires at advancement; later additions can refill the set. Before v3.5 removals applied at advancement with no scheduling event.

**Rate changes**: Create segments in a queue. Settlement processes each with the rate that applied during that time. Adding pieces = immediate rate increase. Removing pieces = deferred rate decrease (next proving boundary).

## Querying Active vs Terminated Datasets

**Active FWSS datasets (never terminated or abandoned)**:
SELECT d.* FROM fwss_data_set_created d WHERE NOT EXISTS (SELECT 1 FROM fwss_service_terminated t WHERE t.data_set_id = d.data_set_id) AND NOT EXISTS (SELECT 1 FROM fwss_data_set_abandoned a WHERE a.data_set_id = d.data_set_id)

To identify a listener, join PDP set_id to fwss_data_set_created and storacha_fwss_data_set_created. If neither matches and the set is live, call PDPVerifier.getDataSetListener(uint256) (0x2b3129bb); zero means no listener. For deleted sets use historical evidence.

**Terminated in lockup**: compare get_dataset().pdpEndEpoch with the current chain head on the same network; 0 < head < pdpEndEpoch means the lockup is running. Unix seconds / 30 is not a Filecoin epoch.

**Datasets still live in PDPVerifier** (not deleted): SELECT d.* FROM pdp_data_set_created d WHERE NOT EXISTS (SELECT 1 FROM pdp_data_set_deleted del WHERE del.set_id = d.set_id)

get_proving_health.activeDataSets counts sets not deleted whose latest period in the last three network periods has positive leaf_count. That's 72 hours on mainnet, six on calibnet. A proof is not required; a later nonempty period counts after a refill. Service termination is a separate state. For SQL on mainnet (use 21,600 seconds on calibnet):
WITH latest AS (SELECT DISTINCT ON (set_id) set_id, leaf_count FROM pdp_next_proving_period WHERE timestamp > EXTRACT(EPOCH FROM NOW()) - 259200 ORDER BY set_id, block_number DESC, split_part(id, '-', 2)::int DESC) SELECT l.set_id FROM latest l WHERE l.leaf_count > 0 AND NOT EXISTS (SELECT 1 FROM pdp_data_set_deleted d WHERE d.set_id = l.set_id)

**Rail status**: endEpoch=0 is active, endEpoch > head is terminated in lockup, 0 < endEpoch <= head is post-lockup. get_rail reads live state; fp_rail_finalized records rails subsequently zeroed.

**Active pieces**: scheduled removals still count. For a live count, use get_dataset_proving.activePieceCount. To list live pieces (replace 55252):
WITH removed AS (
  SELECT set_id, jsonb_array_elements_text(piece_ids::jsonb)::bigint piece_id
  FROM pdp_pieces_removed WHERE set_id = 55252
)
SELECT p.* FROM fwss_piece_added p
WHERE p.data_set_id = 55252
  AND NOT EXISTS (SELECT 1 FROM pdp_data_set_deleted d WHERE d.set_id = p.data_set_id)
  AND NOT EXISTS (
    SELECT 1 FROM removed r
    WHERE r.set_id=p.data_set_id AND r.piece_id=p.piece_id
  );

## FWSS Data Sets

FWSS.dataSetCreated opens one FilecoinPay PDP rail and, only with the CDN add-on, two egress rails:
1. PDP rail: streaming payment for storage. FWSS is both operator and validator.
2. CDN rail: one-time payments for bandwidth. No validator. rate=0, uses lockupFixed.
3. Cache-miss rail: one-time payments for origin fetches. No validator.

**Data set state from get_dataset()**:
- Check pdpRailId first. If zero, FWSS has no current record; unknown, deleted and foreign sets can return zero end epoch and default terms. For a nonzero PDP rail, pdpEndEpoch=0 means active; otherwise compare it to chain head.
- metadata["source"] identifies the creating application. DealBot data sets carry source values "dealbot", "filecoin-pin", or NULL across different rows. Filter by payer address for reliable DealBot identification, not source metadata alone.
- Presence of the withCDN metadata key requests egress at creation; zero rail IDs mean absent. Check the actual rail for later termination. CDN requires USDFC terms.
- providerId links to ServiceProviderRegistry for SP details.

## Proving and Faults

**FWSS proving periods**: calibnet 240 epochs (~2h), mainnet 2880 (~24h). FWSS requires at least 5 challenges per proof. Read getPDPConfig() for the challenge window on the queried network. Other listeners can choose different requirements.

**Proving period convention**: Exclusive-inclusive ranges (A, A+M]. Activation epoch A is a boundary, not billable. Period N covers epochs (A+N*M, A+(N+1)*M]. The deadline is A+(N+1)*M.

**FaultRecord events**: fires only when nextProvingPeriod() is called. If an SP stops calling nextProvingPeriod entirely, no fault events are emitted. Silence does not mean the SP is healthy. To detect truly dead SPs, look for data sets with no recent pdp_next_proving_period events.

**periodsFaulted** counts missed periods reported at this boundary: skipped periods plus the preceding period if it lacked a proof. Sum the field, not event rows. It is not a running streak.

**Proving status from get_dataset_proving()**:
- live: is the data set active in PDPVerifier
- provenThisPeriod and provingDeadline come from FWSS. For another listener inspect its own state; FWSS defaults are not a missed proof.
- lastProvenEpoch is PDP activity, also set at creation or when emptied. For actual proofs query pdp_possession_proven.
- nextChallengeEpoch is the challenge scheduled by PDPVerifier.
- activePieceCount: number of live pieces (0 after all pieces removed)

**Stalled removals**: match scheduled and processed rows by (set_id, piece_id), not tx_hash. Exclude deleted sets first. A pending removal blocks the next boundary; silence alone does not identify the cause.

## Settlement Validation

When FilecoinPay calls FWSS.validatePayment() during settlement:

Each proving period in the settlement range is classified:
- **Proven**: Proof submitted. Full payment for those epochs.
- **Faulted**: Deadline passed, no proof. Zero payment, but settlement advances (settledUpTo moves forward).
- **Open**: Deadline not yet passed. Settlement blocked at the period boundary: can't settle into an unresolved period.

This means:
- An SP that consistently proves gets full payment.
- An SP that faults gets zero payment for faulted periods but the rail can still be settled and finalized.
- Settlement can temporarily stall if the current period is open (waiting for proof or deadline).

## Token Addresses

**USDFC** (legacy FWSS storage currency; also required for FilBeam):
- Calibnet: 0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0
- Mainnet: 0x80B98d3aa09ffff255c3ba4A241111Ff1262F045

**Native FIL**: represented as address(0) = 0x0000000000000000000000000000000000000000

Identify a rail’s currency via fp_rail_created.token. Native FIL, USDFC, axlUSDC and other registered currencies have distinct units. Do not sum mixed-token amounts. Contract-state tools name FIL, USDFC and axlUSDC (mainnet 0xeb466342c4d449bc9f53a865d5cb90586f405215) from a fixed table, and mark any other token's symbol "(unverified)" because its deployer chose it. Identify such a token by its address.

## FilecoinPay Analytics

The fp_* tables provide full payment flow visibility:

**Fund flow**: deposit -> payer account -> streaming settlement or one-time payment -> payee account -> withdrawal. Internal payments are not deposits.

**Per-wallet**: UNION ALL deposits credited to "to" and withdrawals debited from "from" for account flows; joining two histories on wallet multiplies rows. The external depositor or withdrawal recipient can differ from the account holder.

**Per-rail lifecycle**: fp_rail_created (birth) -> fp_rail_rate_modified (rate changes) -> fp_rail_settled (payments) -> fp_rail_terminated (end) -> fp_rail_finalized (zeroed out).

**fp_rail_settled fields are incremental per event, not cumulative** (despite the "total" prefix). SUM() across events for all-time figures:
- total_settled_amount: gross settled in this event.
- total_net_payee_amount: net to SP this event (gross minus fees).
- network_fee: fee this event (burned/auctioned, 0.5%).
- operator_commission: commission this event (currently 0 for both FWSS and Storacha).
- Per-event split: total_settled_amount = total_net_payee_amount + network_fee + operator_commission.
- settled_up_to: epoch settlement has reached. The only cumulative field (monotonic per rail).

**Per-provider storage revenue (FWSS)**: join fp_rail_settled.rail_id = fwss_data_set_created.pdp_rail_id, group by provider_id and rail token. For all operators use fp_rail_created for payer/payee/operator; include one-time payments and keep currencies separate.

**Per-token**: fp_deposit and fp_withdrawal carry token. For settlement or one-time payments, join fp_rail_created by rail_id for token and operator. Group before scaling.

**One-time payments**: fixed lockup funds discrete transfers recorded in fp_one_time_payment. Dedicated one-time rails often have rate zero, but streaming PDP rails can also pay one-time fees. A transfer need not close the rail.

One-time payments carry real value, not just fees: never assume they are all small or mechanical. Four uses:
1. **Direct service/vendor payments (can be large)**: discrete settlements instead of a stream. FIL One pays its vendor this way, on a self-operated rail; such value is invisible to any total that reads fp_rail_settled only, so query fp_one_time_payment.
2. **CDN/cache-miss**: per-dataset bandwidth rails; JOIN fwss_data_set_created via cdn_rail_id / cache_miss_rail_id.
3. **Sybil fees** (v1.2.x, removed v1.3.0): ~0.1 USDFC/dataset to the FilecoinPay contract, immediately finalized (payee = FilecoinPay contract).
4. **FWSS per-op fees** (v1.3.0+): the low-value, high-count bulk of fp_one_time_payment rows (see Per-operation fees). Row count dwarfs (1); its value does not.

**Self-operated rails** (operator == payer wallet, not a service contract; validator == 0x0) are legitimate and can carry large value (FIL One's one-time rail is one). Don't dismiss self-operated or single-rail operators as junk; rank by settled value across both channels, not rail count.

Identify one-time rails via fp_one_time_payment joined to fp_rail_created. Read streaming rates from fp_rail_rate_modified, not the creation event; lifecycle fees can post on a streaming PDP rail.

**Operator approvals**: fp_operator_approval tracks which wallets have approved which operators (typically FWSS) with an approved boolean.

## FWSS Pricing Economics

FWSS v1.6.0 fixes each dataset's storage terms at creation. Record zero is the independent legacy definition: USDFC, 18 decimals, zero salt, 2.5 USDFC/TiB/month. The migration initialized it without emitting StorageTermsRegistered. Pre-migration datasets have no selection row; later creations emit fwss_data_set_storage_terms_selected, including for zero. LEFT JOIN to registrations or lose the legacy datasets. Ordinary IDs hash the token, decimals, salt and price with the type hash. Registration can re-enable an ID; disabling blocks new selections but preserves existing payments. For historical status, order fwss_storage_terms_registered and fwss_storage_terms_disabled by block_number, log_index. A zero-filled getter for a nonexistent dataset also has terms ID zero: establish existence from its PDP rail ID or creation event, never the terms ID alone.

For nonempty datasets the monthly charge is floor(billableBytes * selected price / 2^40) plus the 0.12 dataset fee scaled down to the selected token's decimals. billableBytes = floor(leafCount * 32 * 127 / 128), not exact uploaded bytes. Divide their sum by 86,400 epochs, rounding down. At 6 decimals a 1 TiB dataset priced at 2.5 streams 30 base units/epoch, or 2.592 tokens per 30 days. An empty dataset streams at zero. get_pricing returns the default USDFC price list; get_dataset returns the actual selected terms. For historical charges use fp_rail_rate_modified and settlement events.

**Per-operation fees** (v1.4 schedule, scaled to selected token precision in v1.6):
- createDataSet: 0.025 (one-time, unchanged since v1.3.0)
- addPieces: 0.008 base + 0.003 per piece
- schedulePieceRemovals: 0.007
- terminateService: 0.006 (only on the SP-relayed consent / immediate-termination path; the no-signature path charges 0)

**Fee attribution**: fees draw from the PDP rail lifecycle reserve, batched at the next rate-changing operation. To separate them from egress, join fp_one_time_payment.rail_id to fwss_data_set_created.pdp_rail_id, not just operator. One row may cover multiple operations.

**Lifecycle reserve**: a fixed lockup (\`lockupFixed\`) on the PDP rail, seeded to a 0.50 token target at creation; per-op fees draw it down. On a rate-changing op, if the reserve balance falls below pending-fees + 0.025, it is refilled up to the 0.50 target (to the target, not by a fixed step). Unused reserve refunds to the payer at finalization.

**Legacy terms example**: 1 TiB at 2.5 + 0.12 costs ~2.62 USDFC per 30 days after integer rounding. Streaming lockup = rate × 86,400, in addition to the fixed reserve.

**Historical pricing**: v1.2.x used max(size rate, 0.06 USDFC/month) and a sybil burn rail. v1.3 replaced the floor with a 0.024 monthly dataset fee plus per-op fees. v1.4 raised that fee to 0.12. Use fp_rail_rate_modified for the actual rate at a historical epoch; fwss_pricing_updated is the pre-v1.3 global setter.

Low-precision terms may round individual operation fees to zero. Signed termination still releases reserves; flushing pending fees retains the existing rail rate even for a payer in arrears.

## Cost Attribution

Attribute token charges separately from FIL gas and burns:

**Client-paid via FilecoinPay rails (rail token):**
- FWSS streaming storage, denominated in the selected terms.
- FWSS per-op fees (v1.3.0+) from lifecycle reserve -> SP.
- v1.2.x sybil fee (0.1 USDFC, burned). Removed in v1.3.0.
- CDN egress (where FilBeam configured).
- Operator commission, deducted at settlement; inside settled amount.

**SP-paid as FIL gas (SP's wallet submits the tx, PDPVerifier-mediated):**
- createDataSet, addPieces, piecesRemoved (Curio submits on behalf of the signing client, regardless of which service contract is the listener)
- provePossession + nextProvingPeriod (FWSS cadence on mainnet is once/day per dataset; calibnet is 12×/day; Storacha sets its own proving period)
- Settling, terminating and finalizing rails cost FIL gas to the submitting wallet; identify it from tx_meta.tx_from.
- ServiceProviderRegistry ops (registerProvider, addProduct, updateProduct). Registry is shared across services.

**Client-paid as FIL gas (client's wallet submits):**
- FilecoinPay.deposit / withdrawal / setOperatorApproval (shared FilecoinPay)
- SessionKeyRegistry.authorizationsUpdated (shared SessionKeyRegistry)
- FWSS.terminateService: payer or SP can submit. Attribute gas by tx_meta.tx_from.

**External / auction participants (FIL gas + FIL burn):**
- burnForFees on FilecoinPay. Caller pays tx gas and sends FIL with the tx that gets burned. Not a client, not an SP, but a separate participant class.

**Admin / operator (FilOz multisig, FIL gas):**
- FWSS storage terms registration/disablement, migrations, provider approval/endorsement, FilBeam controller operations. updatePricing is historical.

**Identifying proving senders**: SELECT DISTINCT m.tx_from FROM pdp_possession_proven p JOIN tx_meta m USING (tx_hash). This identifies historical proof senders, not every registered SP.

PDPVerifier is permissionless; ServiceProviderRegistry advertises capabilities, not protocol access rights. A registered SP awaiting its first proof and a custom listener can both be missing from a proof-sender lookup.

**Empirical gas** (recompute, specifics drift with state depth and volume): per-op gas is right-skewed and dominated by storage-tree churn. Historical samples were dominated by addPieces volume; rank by both per-call and total cost for the interval. Cost in FIL = gas x effective_gas_price, both in \`tx_meta\` (one row per tx; aggregating gas over event tables double-counts multi-event txs). For current figures: \`SELECT tx_to, tx_selector, COUNT(*), ROUND(AVG(gas_used)/1e6,0) avg_gas_M, ROUND(SUM(gas_used*effective_gas_price)/1e18,4) fil FROM tx_meta WHERE tx_to IS NOT NULL GROUP BY 1,2 ORDER BY fil DESC\`. Don't quote absolute cumulative totals as current.

## FIL Burn Mechanisms

USDFC accumulates in FilecoinPay's fee auction pool from two sources, then claimants convert it to FIL burns:

**Network fees**: 0.5% of streaming AND one-time payments in an ERC-20 accrue in FilecoinPay’s account for that token. See network_fee in fp_rail_settled and fp_one_time_payment; join fp_rail_created for token.

**Historical sybil rail (FWSS v1.2.x)**: creation paid 0.1 USDFC to FilecoinPay through a temporary rail finalized in the same tx. Earlier FWSS creation burned FIL directly. v1.3 replaced the sybil rail with a create fee to the SP; that fee is not a burn.

Observable: \`fp_rail_created WHERE payee = <FilecoinPay contract address>\` identifies sybil-fee rails. \`fp_one_time_payment\` rows with those rail_ids confirm the payment; \`rail_id\` is the link between the two tables.

**burnForFees(token, recipient, requested)**: anyone can claim up to the available token balance, not necessarily the whole pool. fp_burn_for_fees indexes direct calls from tx input; requested_amount is in the claimed token’s base units. Join tx_meta for the FIL burned (tx_value, attoFIL) and caller.

**Dutch auction**: get_auction.startPrice is the FIL price of a claim, not a price per token. currentPrice = startPrice / 2^(elapsed_seconds / 302400); the 3.5-day halving targets weekly claims. After a claim startPrice = min(4 × decayed price, MAX_AUCTION_START_PRICE), regardless of overpayment. The entire msg.value is burned.

**Direct FIL burn (FIL-denominated rails):** If a rail uses native FIL as the payment token (not USDFC), the network fee is burned directly during settlement. Also visible in fp_rail_settled.network_fee but denominated in FIL.

**Direct FIL burn (PDPVerifier proof fee):** Every \`provePossession\` burns a per-TiB FIL fee from the SP's wallet via msg.value. Default 0.00023 FIL/TiB (Fees.sol DEFAULT_FEE_PER_TIB; configurable via \`pdp_fee_update_proposed\`). Indexed as \`pdp_proof_fee_paid(set_id, fee)\` (FIL, 18 dec). SUM(fee) gives total SP-burned FIL across proofs. PDPVerifier also holds a 0.1 FIL cleanup deposit per dataset at create-time, paid to whoever finalizes cleanup. An unclaimed deposit is held, not burned.

**To analyze total burn:**
- Live token pool: get_auction for that token. A historical flow estimate needs fees from both payment channels, net payee proceeds on legacy sybil rails (their network fees already counted) and successful claims, all in the same token.
- Auction FIL burn for indexed calls: SELECT SUM(m.tx_value)/1e18 AS fil FROM fp_burn_for_fees b JOIN tx_meta m USING (tx_hash) WHERE m.status = '0x1'. Internal calls via other contracts are not indexed by this input decoder.
- FIL burned by SPs at proof submission: SUM(fee) from pdp_proof_fee_paid
- Native FIL rail fees: sum network_fee across both payment channels, join fp_rail_created by rail_id and filter token = address(0).

## Service Provider Registry and Provider Tiers

Providers register with a name, description, and capabilities. Use get_providers to fetch all providers with their full status in one call.

**Provider flags** (read each independently):
1. **Registered** (isActive): FWSS v1.6 checks registry membership at creation, not approval or endorsement.
2. **Approved** (isApproved=true): passed DealBot's automated quality checks; eligible as secondary copy target.
3. **Endorsed** (isEndorsed): curated ProviderIdSet membership, used for primary-copy selection. Read isApproved separately.

When analyzing: faults from endorsed providers matter most (explicitly vouched for); approved-but-not-endorsed faulting is expected noise on calibnet. Always resolve provider IDs to names, show as "Name (ID)".

**Provider capabilities (from ServiceProviderRegistry products):**

SPs register products (currently productType=0 for PDP storage) with key-value capabilities stored on-chain. Capability values are bytes on-chain but typically UTF-8 strings. In the indexed tables (spr_product_added, spr_product_updated), capabilities are stored as JSON objects with string keys and decoded string values.

Required PDP capability keys:
- serviceURL: the SP's API endpoint (e.g. "https://curio-pdp.example.com")
- minPieceSizeInBytes, maxPieceSizeInBytes: piece size range
- storagePricePerTibPerDay: advertised daily price in token base units; not the selected FWSS monthly dataset price.
- minProvingPeriodInEpochs: minimum proving period
- location: geographic location, typically in format "C=US;ST=California;L=San Francisco" (C=country ISO, ST=state, L=city)
- paymentTokenAddress: ERC-20 token address for payment (address(0) for FIL)

Known optional PDP capability keys (not exhaustive, SPs can register arbitrary keys):
- ipniPiece: supports IPNI piece CID indexing
- ipniIpfs: supports IPNI IPFS CID indexing
- ipniPeerId: IPNI peer ID

To query capabilities: SELECT capabilities::jsonb->>'location' FROM spr_product_added WHERE provider_id = 1
To find SPs in a country: SELECT * FROM spr_product_added WHERE capabilities::jsonb->>'location' LIKE 'C=CN%' (For current capabilities use the latest product addition or update; the examples inspect registrations.)

## Network Differences

| Property | Calibnet | Mainnet |
|----------|----------|---------|
| Chain ID | 314159 | 314 |
| Proving period | 240 epochs (~2h) | 2880 epochs (~24h) |
| Proving frequency | 12x/day | 1x/day |
| Fault volume | Very high (12x frequency) | Much lower |
| Purpose | Testing | Production (real money) |

Calibnet has 12 times as many scheduled FWSS proving periods per day. Normalize by period opportunities and active datasets; this does not imply a 12:1 fault count or settlement count. Read current provider counts from the registry.

## Contract Deployment History

Use the upgrade boundary of the emitting contract on the queried network. A stack release can span multiple transactions.

Both networks reached FWSS v1.6.0 with PDPVerifier v3.5.0. Read VERSION() at the relevant proxy and check execution receipts; a release date or announcement is not proof of deployment.

**v1.0.0: GA Release (November 2, 2025)**
- Deployment of the current proxy addresses on both networks.
- MIN(block_number) on fp_deposit is the first matching deposit, not deployment or indexer start. See Tool Data Provenance for coverage.
- Introduced: FWSS GA contracts, FilecoinPay v1, PDPVerifier v3.1.0, ServiceProviderRegistry with capability key-value store, SessionKeyRegistry.
- Source: [filecoin-services v1.0.0](https://github.com/FilOzone/filecoin-services/releases/tag/v1.0.0)

**v1.1.0: Upgrade (January 30, 2026)**
- UUPS proxy upgrade of FWSS, PDPVerifier, and ServiceProviderRegistry. Same proxy addresses, new implementation contracts.
- Calibnet: ~epoch 3,414,500. Mainnet: ~epoch 5,476,400.
- Added: ProviderIdSet (endorsed providers), two-step upgrade announcements, CDN validation, automatic rate modification on piece addition.
- Changed: rail settlement required before data set deletion, deferred rate recalculation.
- Source: [filecoin-services v1.1.0](https://github.com/FilOzone/filecoin-services/releases/tag/v1.1.0)
- Deployed addresses: [deployments.json](https://github.com/FilOzone/filecoin-services/blob/v1.1.0/service_contracts/deployments.json)

**v1.2.0: Upgrade (March 18-19, 2026)**
- UUPS proxy upgrade of FWSS and PDPVerifier. Same proxy addresses.
- Calibnet: March 18. Mainnet: March 19.
- Added 0.1 USDFC sybil fee via temporary rail instead of the FIL creation burn, plus getActivePiecesByCursor for paginated PDP queries.
- Impact on fee auction: pool now grows by 0.1 USDFC per data set creation (dominant source), not just settlement trickle.

**v1.2.1: Patch (mainnet 2026-05-28)**: drops PDPVerifier sybil-fee dependency; burn rail unchanged.

**v1.3.0: Upgrade (calibnet 2026-06-09, mainnet 2026-06-11)**
- UUPS proxy upgrade of FWSS + PDPVerifier (v3.4.0). Same proxy addresses.
- Pricing locked per-dataset at create-time. \`PricingUpdated\` removed; \`fwss_pricing_updated\` is legacy v1.2.x. Live rates via eth_call \`getCurrentPricingRates()\` (2nd return: minimumRate -> datasetFee) or \`getPriceList()\`.
- Sybil burn rail gone; createDataSet fee is 0.025 USDFC paid directly to the SP. Auction pool stops growing from this source post-upgrade.
- New \`DataSetAbandoned\` -> \`fwss_data_set_abandoned\`: third party calls PDPVerifier.deleteDataSet after PDP_INACTIVITY_WINDOW with no terminateService. Lifecycle endpoint distinct from \`fwss_service_terminated\`.
- fwss_service_terminated.approver normalizes both eras: before v1.3 it holds the legacy event’s caller, not a separate SQL column.
- \`RailRateUpdated\`, \`CDNPaymentRailsToppedUp\`, \`CDNServiceTerminated\` move to a Rails library; same topic hash, FWSS proxy still emitter.
- Source: [filecoin-services v1.3.0](https://github.com/FilOzone/filecoin-services/releases/tag/v1.3.0)

**v1.4.0: Upgrade (mainnet epoch 6,338,200; calibnet 4,029,095)**
- PDPVerifier v3.5.0 activated earlier than FWSS 1.4: mainnet 6,338,104; calibnet 4,028,982. Use the PDP cutover for compact adds and scheduled removals.
- Two-step piece removal: schedulePieceDeletions emits PiecesScheduledForRemoval (\`pdp_pieces_scheduled_for_removal\`); the SP then calls processPieceDeletions, emitting PiecesRemoved (\`pdp_pieces_removed\`). nextProvingPeriod reverts while the queue is non-empty, so a dataset with unprocessed scheduled removals stalls and emits nothing (no FaultRecord). Pre-v3.5.0 removal applied inside nextProvingPeriod: compare the two tables by piece id, post-upgrade rows only.
- fwss_data_set_authorizer_set records programmable authorization for adds, removals and signed termination. Only the signed termination path reports the payer when a custom authorizer is configured.
- \`PiecesAddedV2\` (compact) supersedes \`PiecesAdded\`; \`pdp_pieces_added\` covers both eras.
- Recalibrated operation fees + lifecycle reserve (see FWSS Pricing Economics).
- Source: [filecoin-services v1.4.0](https://github.com/FilOzone/filecoin-services/releases/tag/v1.4.0)

- v1.5.0 moved FWSS, at unchanged proxy addresses, from the v1.4 UUPS monolith to the upstream ERC-8167 dispatcher. Selectors route to modules. From v1.5.0 the proxy serves its views; a StateView matters only before the transition on a given network. Future FWSS upgrades use josuke announceMigration then migrate, not UUPS upgradeToAndCall. Execution: mainnet 6,482,202; calibnet 4,177,782.
- v1.6.0 is a josuke FWSSStorageTermsMigration over the dispatcher. It atomically installs zero/legacy terms and routes the v1.6 modules. It also moves legacy piece-metadata cleanup out of nextProvingPeriod and dataSetDeleted. PDP remains 3.5.0. Execution: mainnet 6,560,696; calibnet 4,256,439. In that calibnet block two FWSS creations preceded migration and one followed it: use receipt order and the terms selection event, not block number alone.

For history, contract_upgraded records UUPS implementation upgrades, not dispatcher routing or every later migration. FWSS dispatcher work is visible through fwss_erc1967_upgraded, fwss_diamond_delegate_call and fwss_selector_delegated; group delegate calls by tx_hash because one migration can route many selectors. A zero delegate removes a route. upgrade_announced.after_epoch is an earliest execution epoch, not proof an upgrade executed.
For UUPS history: SELECT contract, version, implementation, TO_TIMESTAMP(timestamp) AS upgraded_at FROM contract_upgraded ORDER BY block_number. For execution receipts: https://github.com/FilOzone/filecoin-services/releases/tag/v1.6.0 .

**Orphan rails from defunct service contracts**: FilecoinPay is shared; rails created by pre-v1.0.0 FWSS or other abandoned operators persist in fp_* with no matching fwss_data_set_created. Filter \`fp_rail_created.operator\` to scope aggregates. Known abandoned operator: calibnet 0xd3de778c05f89e1240ef70100fb0d9e5b2efd258 (rails 1-23, pre-v1.0.0 FWSS, never settle).

**Legacy piece metadata**: v1.4 stopped storing new piece metadata on chain: query fwss_piece_added. v1.6 moved legacy cleanup out of proving/deletion callbacks. Cleaning a live legacy queue preserves the pending rate update; a legacy FWSS queue is not a PDP removal queue.

## Tool Data Provenance

When explaining results to users, cite the source and any caveat:

**Indexed history**: configured starts are mainnet 5,215,000 and calibnet 3,090,002. Ponder captures handled topics at configured addresses; some filters start later or exclude deployments (e.g. calibnet PoRep V2). get_status reports reachability and estimates, not the indexed head. Missing rows do not establish inactivity. Join tx_meta by tx_hash for receipt data; fp_burn_for_fees comes from direct tx inputs, not logs.

**Live state** (get_providers, get_provider, get_dataset, get_dataset_proving, get_rail, get_pricing, get_account, get_auction): direct eth_call via Lotus RPC. Always current block, no history. A finalized rail (settled + zeroed) reverts on getRail() by design.

**Deal/retrieval quality** (get_dealbot_*, except failures): BetterStack ClickHouse over Prometheus counters from DealBot (4 deals + 4 IPFS retrievals per SP per hour). Windows quantized to 1h/6h/12h/24h/72h/7d/30d/90d, cached 5-60min. Counts run ~10-15% low due to counter aggregation across pod restarts; rates are accurate. dealbot.filoz.org is the absolute-count source.

**Failure analysis** (get_dealbot_failures): DealBot REST direct (\`/v1/metrics/failed-{deals,retrievals}/summary\`). Recent failures from DealBot's database, not Prometheus. Error categories include "fetch failed" (SP unreachable), 502 (backend down), "LockupNotSettledRateChangeNotAllowed" (payment contract).

**Proving health** (get_proving_health, get_proving_dataset): local "proof-gap" computation over indexed PDPVerifier events. For each consecutive NextProvingPeriod pair on a dataset, a missing PossessionProven in the gap is a fault; multi-period gaps are inferred as skipped faults. Proving period is derived per-dataset from the mode of observed gaps (operator-agnostic: works for FWSS, Storacha, future services). "Active" counts non-deleted sets with positive leaf_count at their latest recent period boundary (three network periods); neither a proof nor uninterrupted nonemptiness is required. Counts are proving periods, not challenges (challenges-per-proof is listener-specific and not multiplied).

**Goldsky cross-validation** (get_proving_health_goldsky, get_proving_dataset_goldsky): PDP Explorer subgraph, independent computation. Known issues: hardcoded proving period (240, PR #96 pending), ~35% isActive inflation, hardcoded challengesPerProof=5, FWSS-centric entities. Use for cross-check; trust local computation where they diverge.

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

At four probes/hour, 200 samples need at least 50 hours per metric; judge retention on actual proving periods (cadence differs by network). Endorsement adds non-technical curation.

**DealBot maintenance windows** (checks paused): 07:00-07:20 UTC, 22:00-22:20 UTC.
**Hosting**: EU (dealbot.filoz.org). Latency metrics biased toward EU SPs. No strict latency requirements in approval criteria.

**Choosing the right time window for deal/retrieval metrics:**
- For **SLA pass/fail verdicts**: hours=72 (default). Gives ~288 deal checks (96/day x 3 days), exceeding the 200-check minimum. Always show sample counts alongside rates.
- For **trend analysis**: hours=168 (7d) or hours=720 (30d). Or use get_dealbot_daily for per-day time-series.
- For **regression detection**: compare hours=72 (recent) vs hours=720 (30d average).
- Time windows are quantized to: 1h, 6h, 12h, 24h, 72h, 7d, 30d, 90d. Inputs round up to the next tier. Cached 5-60min depending on window size.

**Interpreting deal/retrieval data:**
- All-registered averages include providers with failing probes. Compare tiers and report the time window rather than treating a past network average as a target.
- DealBot tests all registered providers equally (not just approved/endorsed). Filter by providerStatus for meaningful quality metrics.
- The get_dealbot_failures tool classifies errors from DealBot's own database: "fetch failed" = SP unreachable, 502 = backend down, "LockupNotSettledRateChangeNotAllowed" = payment contract issue.

**IPFS retrieval vs legacy retrieval: important distinction:**
The BetterStack-backed tools return ipfsRetrievalSuccessRate (active, use for SLA). The DealBot REST API also has a legacy retrievalSuccessRate field that tracked an older HTTP retrieval method. This may be frozen/stale and should not be used for SLA assessment. When assessing retrieval SLA (>= 97%), always use ipfsRetrievalSuccessRate.

**IPNI pipeline (available via DealBot REST API, not in BetterStack tools):**
IPNI (InterPlanetary Network Indexer) verification is tracked separately in DealBot's own database: indexed -> advertised -> verified. A provider can complete a deal but fail IPNI verification, making data unretrievable via content routing. Fields like ipniSuccessRate, totalIpniDeals are available through the DealBot web dashboard (dealbot.filoz.org) but not through the get_dealbot_* MCP tools. A provider with 95% deals but 0% IPNI is storing data but invisible to the network.

## Proving Fault Data: Three Sources, Different Accuracy

Three places to get fault/proving data:

1. **Local proof-gap computation** (get_proving_health, get_proving_dataset): **primary**. Computed from indexed PDPVerifier events. Detects faults by checking for missing PossessionProven events between consecutive NextProvingPeriod calls. Infers skipped periods when an SP goes dark (epoch gap > one proving period). Operator-agnostic (works for FWSS, Storacha, any listener). Derives proving period per-dataset from observed data. Use this for SLA retention assessment (<= 0.2%).

2. **PDP Explorer subgraph** (get_proving_health_goldsky, get_proving_dataset_goldsky): **cross-validation**. Independent computation via Goldsky-hosted subgraph. Has known issues (hardcoded proving period, isActive inflation, challenge count assumptions). Use to cross-check local results when accuracy is critical.

3. **On-chain fwss_fault_record** (query_sql): **FWSS-only** supplementary data. Only fires for FWSS-operated datasets when nextProvingPeriod is called. Missing faults for Storacha and other operators. Useful for FWSS-specific investigation (when did faults start? which datasets? gas costs?) but not for aggregate fault rates.

4. **BetterStack/DealBot**: Deals and IPFS retrieval only. No retention/proving data.

**Cross-referencing across sources:**
- SP faulting in get_proving_health and failing DealBot deals = systemic problem (SP likely down)
- SP clean in get_proving_health but failing DealBot deals = upload/network issue, not a proving problem
- SP faulting in get_proving_health but passing DealBot deals = proving-specific issue (gas, timing, or specific datasets)
- A long gap warrants inspection of the individual datasets; deletion, an empty set and a silent provider have different implications.
- Local and Goldsky results diverge significantly = investigate specific datasets, may indicate subgraph bug or data gap

## Aggregate FilecoinPay Metrics (network-wide, all operators)

For network-wide metrics, start from fp_* tables. **Do not join** to fwss_* tables, which only capture FWSS-operated rails and miss every other operator on FilecoinPay (Storacha [wound down], PoRep Market, and occasional one-offs). Operator shares shift; compute them per question (Revenue by operator).

**Net payee revenue**: UNION ALL (rail_id, total_net_payee_amount) from fp_rail_settled and (rail_id, net_payee_amount) from fp_one_time_payment. JOIN fp_rail_created USING (rail_id), sum per token and divide by 10^decimals (USDFC/FIL 1e18, axlUSDC 1e6).
**Gross volume**: union fp_rail_settled.total_settled_amount and the one-time sum net_payee_amount + network_fee + operator_commission. Do not add gross streaming payments to net one-time payments.
**ARR (Annual Recurring Revenue)**: Use fp_rail_rate_modified (not fwss_rail_rate_updated which is FWSS-only). For active non-terminated non-finalized rails: SUM the latest new_rate per rail_id, multiply by epochs_per_year (2880 * 365), per token. Or query live rail state via get_rail.
**Volume by operator**: same two-channel union, grouped by operator and token. This measures activity, not the operator’s earnings; operator_commission is separate.
**Revenue by payee**: group net by payee and token; filter by provider or service for SP revenue, since payees can also be vendors, FilBeam or FilecoinPay itself.
**Deposits/withdrawals**: group by token. Net flows alone do not capture auction outflows or native FIL fees burned; use actual balances for TVL.

Known mainnet operators (lowercase; refresh via SELECT DISTINCT operator, COUNT(*) rails FROM fp_rail_created GROUP BY operator):
- FWSS: 0x8408502033c418e1bbc97ce9ac48e5528f371a9f
- FIL One (Filecoin Foundation's S3-style service, web2 large-data market vs FWSS's web3 focus): the canonical case where the one-time channel matters. It settles to its vendor through both a self-operated rail (payer+operator 0x5b27dbc6efefbb5ba8106fb19433048d60d6878f, in fp_one_time_payment) and a streaming rail via its service contract (operator 0x9d4f07b948e87941a4bf4ab335d7a7d854843d75, in fp_rail_settled). Size it from both channels, never fp_rail_settled alone; for current figures, query the tables.
- PoRep Market (fidlabs cold storage): deploys one per-deal validator as operator, so it shows as many operators: now indexed in porep_* tables; join porep_rail_id_updated.rail_id = fp_rail_created.rail_id to attribute. Coordinator 0xbd669abd1188f52e82af114e17ace2842dcc0eb4.
- Storacha (historical operator): 0x56e53c5e7f27504b810494cc3b88b2aa0645a839

**Storacha history**: separate v1.2.x FWSS fork, wound down 2026-04-19. Historical service rows are in storacha_fwss_*; proofs and payments share pdp_* and fp_*. For settlements join fp_rail_created by rail_id and filter its operator (mainnet above; calibnet 0x0c6875983b20901a7c3c86871f43fdee77946424). Its providers used did:key names.

## FilBeam (incentivized data delivery / CDN)

FilBeam is the CDN / data delivery layer for FOC. Clients retrieve their stored content via FilBeam's global edge infrastructure; pay-per-byte billing is settled on-chain through a hybrid model (off-chain measurement, on-chain accounting). When a dataset is created with CDN enabled, FWSS creates two egress payment rails alongside the storage rail:

- **CDN rail** (payer -> FilBeam): pays FilBeam for content delivery from the edge cache. Covers **total** egress (cache hits + cache misses).
- **Cache-miss rail** (payer -> Storage Provider): compensates the SP when FilBeam has to fetch origin data from them. Covers **only** the cache-miss bytes.

Egress is USDFC-only. The advertised schedule is 7 USDFC/TiB on total egress plus 7/TiB on origin fetches (14/TiB if every request misses). Actual FilBeam billing uses each emitting operator’s immutable cdnRatePerByte and cacheMissRatePerByte. Storage uses separate dataset terms.

**FilBeamOperator** is non-upgradeable; several historical deployments report aggregated bytes, not per-request data.

**Byte accounting**: cdn_bytes_used includes hits and misses; cache_miss_bytes_used is a subset, not additional traffic. Hit ratio = 1 - SUM(cache_miss_bytes_used)::numeric / NULLIF(SUM(cdn_bytes_used), 0). Weight by bytes rather than averaging rollup ratios.

**Rollup cadence**: mainnet every 4h; calibnet every 30min, through the previous finalized epoch. fb_usage_reported is the usage ledger; fb_controller_updated identifies reporter-controller changes.

**Important caveat**: Only traffic proxied through FilBeam is reported on-chain. If users retrieve content directly from SPs bypassing FilBeam, that traffic is not in fb_* tables. These tables represent billable FilBeam-proxied traffic, not all retrievals.

**Tables (fb_*)**:
- fb_usage_reported: bandwidth rollups (data_set_id, from_epoch, to_epoch, cdn_bytes_used, cache_miss_bytes_used). The bandwidth ledger.
- fb_cdn_settlement / fb_cache_miss_settlement: USDFC settled per rail (capped to lockupFixed of the rail).
- fb_payment_rails_terminated: FilBeam-initiated CDN service termination.
- fb_controller_updated: who can call recordUsageRollups (off-chain reporter authorization).
- fb_fwss_filbeam_controller_changed: handover between historical FilBeamOperator deployments.
- fb_ownership_transferred: FilBeamOperator owner changes.

**Joining to FWSS**: data_set_id is the join key. Bandwidth and settlements are **per dataset**, not per rail.

Bytes and CDN settlement per dataset (aggregate before joining):
WITH usage AS (SELECT data_set_id, SUM(cdn_bytes_used) AS total_bytes, SUM(cache_miss_bytes_used) AS miss_bytes FROM fb_usage_reported GROUP BY data_set_id), paid AS (SELECT data_set_id, SUM(cdn_amount::numeric)/1e18 AS cdn_usdfc FROM fb_cdn_settlement GROUP BY data_set_id) SELECT u.*, COALESCE(p.cdn_usdfc,0) AS cdn_usdfc, d.payer, d.provider_id FROM usage u JOIN fwss_data_set_created d USING (data_set_id) LEFT JOIN paid p USING (data_set_id)

**Joining to FilecoinPay**: fwss_data_set_created.cdn_rail_id and .cache_miss_rail_id link to fp_rail_created.rail_id. The actual on-chain payment is recorded in fp_one_time_payment (not fp_rail_settled), since CDN rails use one-time payment mechanics. fb_cdn_settlement.cdn_amount is gross payer spend; fp_one_time_payment.net_payee_amount is net proceeds.

**Multiple operator instances**: retain fb_*.operator when attributing rollups to a deployment. For a handover use fb_fwss_filbeam_controller_changed.new_controller; an event’s operator is the emitter, not necessarily the successor.

**Off-chain only data**: Per-request bandwidth is not on-chain. The smallest granularity is the rollup window between consecutive UsageReported events for a dataset. There is no per-client or per-region breakdown on-chain.

## Common Investigation Patterns

SQL queries time out after 30 seconds. Bound exploratory queries by block or time. Use list_tables for approximate counts: an unfiltered COUNT(*) on fwss_piece_added or pdp_possession_proven can scan the whole table even with LIMIT 1 after the aggregate.

Cartesian product trap: never join fwss_fault_record and pdp_next_proving_period (or pdp_possession_proven) both independently to fwss_data_set_created in the same query. Both have multiple rows per data_set_id, so the join produces a cross product that inflates all counts. Always aggregate each table separately first using CTEs or subqueries, then join the aggregated results.

Correct pattern:
WITH faults AS (SELECT d.provider_id, SUM(f.periods_faulted) as total_faults FROM fwss_fault_record f JOIN fwss_data_set_created d ON f.data_set_id = d.data_set_id GROUP BY d.provider_id), proving AS (SELECT d.provider_id, COUNT(*) as proving_calls FROM pdp_next_proving_period p JOIN fwss_data_set_created d ON p.set_id = d.data_set_id GROUP BY d.provider_id) SELECT p.provider_id, p.proving_calls, COALESCE(f.total_faults, 0) as faults FROM proving p LEFT JOIN faults f ON p.provider_id = f.provider_id

**Provider health**: Join fwss_fault_record with fwss_data_set_created ON data_set_id to get provider_id. GROUP BY provider_id. Also call get_providers to get names and tiers. Check get_dataset_proving for live status of specific data sets. Always check for silent SPs by looking at MAX(timestamp) on pdp_next_proving_period grouped by data set.

**SLA assessment**: Three metrics from two sources:
- Deal success (>= 97%): get_dealbot_provider_detail with hours=72. Check sample count >= 200.
- IPFS retrieval success (>= 97%): same tool. Check sample count >= 200. Use ipfsRetrievalSuccessRate (not legacy retrievalSuccessRate).
- Retention fault rate (<= 0.2%): get_proving_health with the provider's EVM address. Use totalFaultedPeriods / totalProvingPeriods. Check totalProvingPeriods >= 500 for statistical validity.
Always show sample counts alongside rates.

**Settlement flow**: see FilecoinPay Analytics for the fp_rail_settled field breakdown (incremental amounts, settled_up_to cumulative), the per-rail lifecycle, and FWSS-vs-network-wide joins.

**Lifecycle trace**: fwss_data_set_created (+ storage terms selection from v1.6) → fwss_piece_added → proving boundaries and proofs. Optional branches: piece removal, authorizer changes, FWSS fault records. On normal termination the SP proves through the payment window, then settlement/finalization and optional PDP deletion. Abandonment follows a distinct path.

**Silent SP detection**: local get_proving_health measures gaps between observed boundaries. For a trailing silence, compare the last boundary block and provingDeadline to chain head (epochs); check deletion, leaf count, termination and removal queues before diagnosing a fault.

**Partitioning by application**: The source column on fwss_data_set_created identifies which application created each data set (e.g. "filecoin-pin", "synapse-example"). To scope analysis to a specific dapp, filter WHERE source = 'filecoin-pin'. NULL source includes early data sets and apps that haven't adopted the source convention.

**Identifying customers**: Known wallets (both networks): DealBot (legacy): 0xa5F90bc2AA73a2E0Bad4D7092a932644d5dD5d71, DealBot (current multisig): 0x305025D07c1DEe47F25a4990179eFf2becddCA0B, Storacha: 0x3c1ae7a70a2b51458fcb7927fd77aae408a1b857, Tippy/ezpdpz: 0x3E4E5f067cfdA2F16Aade21912B8324c3D9624F8 (endorsed SP operator), PinMe: 0xd19d84c77bbb901971e460830e310933a210dbaa. Use payer address to filter by party, not source metadata. Hex columns (addresses, tx_hash) store lowercase: compare with lowercase literals or LOWER(); a checksummed literal silently matches nothing. DealBot source can be NULL, filecoin-pin or dealbot.

**Session keys for a signer**: expand updated permissions before selecting the latest per scope. This query checks now. For end-of-block B, add block_number <= B inside changes, then compare expiry against that block’s Unix timestamp instead of NOW().
WITH changes AS (SELECT identity, signer, jsonb_array_elements_text(permissions::jsonb) AS scope, expiry, block_number, split_part(id, '-', 2)::int AS log_idx FROM skr_authorizations_updated WHERE signer = '0x...'), latest AS (SELECT DISTINCT ON (identity, signer, scope) * FROM changes ORDER BY identity, signer, scope, block_number DESC, log_idx DESC) SELECT * FROM latest WHERE expiry >= FLOOR(EXTRACT(EPOCH FROM NOW()))
A revocation of one scope leaves the signer’s other scopes unchanged.

**Transaction types and gas analysis**: Data set operations come in three forms, identifiable by which events share a tx_hash:
1. **Create only**: pdp_data_set_created + fwss_data_set_created + fp_rail_created (storage rail, optional egress rails and, in v1.2.x, a sybil rail); no piece additions for that set in the transaction.
2. **Add to an existing set**: pdp_pieces_added + fwss_piece_added (one per piece); no creation for that set in the transaction.
3. **Combined create+add** (default Synapse SDK path): pdp_data_set_created + fwss_data_set_created + fp_rail_created + pdp_pieces_added + fwss_piece_added + fwss_rail_rate_updated all in one tx. This is what happens when addPieces is called with dataSetId=0, PDPVerifier creates the data set first, then adds pieces, triggering both FWSS callbacks in sequence.

Match pdp_data_set_created and pdp_pieces_added USING (tx_hash, set_id). A match proves both operations occurred for that set in one tx, not which entry point ran; inspect calldata or traces to distinguish batching from addPieces(0, ...). Gas: SELECT gas_used*effective_gas_price/1e18 FROM tx_meta WHERE tx_hash = '<hash>'.

PDP 3.5 emits at most 100 pieces per pieces-added event. Sum pdp_pieces_added.piece_count per tx_hash before joining tx_meta and comparing gas across batch sizes; one transaction can emit several batches.

**Total data stored**: SUM(fwss_piece_added.raw_size) measures historical bytes added, including later removals. For current bytes, sum raw_size over the active-piece query. For ongoing FWSS service also exclude terminated/abandoned sets. Divide by 2^40 for TiB or 10^12 for TB.

**Stuck settlements**: Rails where settledUpTo is far behind the current epoch. Join fp_rail_settled with fp_rail_created to find rails with no recent settlement. Could indicate a stuck validator, underfunded payer, or open proving period blocking progress.

**Empty-dataset settlement**: an empty set streams at zero under current pricing. FilecoinPay calls the FWSS validator when someone settles, not when the SP proves. Zero new accrual does not erase earlier payable epochs. Check rate history, funding, settledUpTo and proving deadline before calling a missing settlement a fault. A zero-rate segment can still advance settledUpTo and emit RailSettled.

**Gas per operation**: aggregate over \`tx_meta\` (one row per tx), never over event tables: one tx often fires several events (every addPieces also fires \`fp_rail_rate_modified\`), so event-table gas sums double-count. See Cost Attribution for the per-function breakdown (\`GROUP BY tx_to, tx_selector\`) and reference averages.

**Who pays for what** is fixed by the operation, not the wallet: most ops are SP-paid (SPs submit via Curio); full taxonomy in Cost Attribution above. Rail ops (settleRail/terminateRail/finalizeRail/oneTimePayment) and FWSS.terminateService are either-party: whoever submits pays gas (settleRail/finalizeRail ~99% SP-submitted); attribute by tx_meta.tx_from.

**FWSS.terminateService variants (v1.3.0+):**
- (1) **SP unilateral**: SP calls \`terminateService(id)\`. approver=SP. 30-day lockup.
- (2) **Client unilateral**: payer calls \`terminateService(id)\`. approver=payer. 30-day lockup.
- (3) **Client-consent, SP-relayed** (intended GA path): client signs EIP-712, SP calls \`terminateService(id, sig)\`. approver=recovered payer key. \`immediateTermination=true\`: rail ends at block.number, skipping the 30-day lockup. Client pays the termination fee (0.006 in the rail token, rounded to its precision) from the lifecycle reserve; SP pays gas.
- (4) **Session-key, SP-relayed**: as (3) but signature from a session key authorized via SessionKeyRegistry (TERMINATE_SERVICE_TYPEHASH). approver=session-key address.

Identify the call branch from calldata or traces. Empty extraData: approver is the immediate caller (payer or SP), even with a custom authorizer. Nonempty extraData: SP submitted; a custom authorizer reports payer, otherwise approver is the recovered payer/session key. Check the authorizer and session grant at execution, not current state; tx_meta.tx_from is the outer sender.

**Known mainnet targets and selectors** (use deployments.json for network-specific proxies):
- PDPVerifier \`0xBADd0B92C1c71d02E7d520f64c0876538fa2557F\`: \`0x9afd37f2\` addPieces, \`0xf58f952b\` provePossession, \`0x45c0b92d\` nextProvingPeriod, \`0xbbae41cb\` createDataSet
- FilecoinPay \`0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa\`: \`0x8340f549\` deposit, \`0x8ef59739\` depositWithPermit, \`0x7218b707\` depositWithPermitAndApproveOperator, \`0xf3fef3a3\` withdraw, \`0x875bc8b6\` setOperatorApproval
- FWSS \`0x8408502033C418E1bbC97cE9ac48E5528F371A9f\`: \`0xd0e3c954\` terminateService(uint256,bytes), \`0xb997a71e\` terminateService(uint256) (deprecated in v1.6.0)
- Multicall3 \`0xcA11bde05977b3631167028862bE2a173976CA11\`: \`0x252dba42\` aggregate. Historically SPs used it to batch settlements; confirm fp_rail_settled shares tx_hash before attributing the gas to storage payments.
- SessionKeyRegistry and ServiceProviderRegistry: use deployments.json. For FilBeam operator handovers use fb_fwss_filbeam_controller_changed, not provider wallets.

When asked "what's expensive?" use this breakdown directly. When asked "what does X cost?" filter to the relevant selector. Don't infer from event tables.

**FWSS metadata budget**: v1.6 FWSSConstants.sol caps create extraData at 5,120 bytes, removal scheduling and termination at 1,024 each; up to 10 keys per dataset, 3 per piece, 32 bytes/key and 96 bytes/value. Do not use the old 8 KiB addPieces estimate to size batches. Empty metadata outer arrays are allowed.

Compare indexed metadata volume across batches: SELECT tx_hash, COUNT(*) AS pieces, COALESCE(SUM(OCTET_LENGTH(metadata)),0) AS json_bytes FROM fwss_piece_added GROUP BY tx_hash ORDER BY json_bytes DESC. This measures JSON text, not ABI calldata or a maximum batch size.

## Building dashboards

The REST API at {{BASE_URL}} (SQL: {{BASE_URL}}/sql) mirrors the MCP tool surface, with CORS enabled and no auth required. Endpoint shapes follow tool names: \`/sql\`, \`/providers/:network\`, \`/dataset/:network/:id\`, \`/rail/:network/:id\`, \`/metrics/*\`, \`/proving/*\`, \`/dealbot/*\`. \`/sql\` accepts the same SELECT-only payloads as query_sql with a 10,000-row cap. Sample counts in DealBot-backed metrics are ~10-15% lower than DealBot's database due to Prometheus counter aggregation; rates are accurate. For Claude.ai sandboxed artifacts, route through the Anthropic API with this MCP server attached (CSP blocks direct fetch); for standalone HTML or hosted apps, fetch() works directly.

## Block explorers

Mainnet: \`https://filecoin.blockscout.com/tx/{txHash}\`. Calibnet: \`https://filecoin-testnet.blockscout.com/tx/{txHash}\`. Filfox and Beryx also available; Blockscout is the SDK stack default.

## Transaction and Event Metadata

Every event row carries only join keys and block context:
- id: {blockHash}-{logIndex} (unique event identifier)
- tx_hash: transaction hash. JOIN key for tx_meta.
- block_number: Filecoin epoch
- timestamp: unix seconds

Tx-level fields (tx_from, tx_value, gas_used, effective_gas_price, tx_to, tx_selector, status) live in the \`tx_meta\` table (one row per tx). Not duplicated on event rows. Every gas/sender/value query joins through tx_meta:

Filter on tx_meta.tx_from for the sender. When joining multiple event tables, use an explicit ON m.tx_hash = e.tx_hash; for gas totals select distinct matching tx_hash first, then sum m.gas_used*m.effective_gas_price/1e18 once per transaction.

Block ranges and time use the event row directly (no JOIN): \`WHERE block_number BETWEEN x AND y\` or \`TO_TIMESTAMP(timestamp)\`.

To link to a block explorer: use tx_hash with the explorer URL templates (see Block Explorers section).
fp_burn_for_fees.id uses the transaction index instead of log index. requested_amount is in token base units; FIL and caller come from tx_meta.tx_value and tx_from.

`
