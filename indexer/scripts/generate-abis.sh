#!/usr/bin/env bash
#
# Generate TypeScript ABI files from deployed FOC contract releases.
# Run from the indexer directory: ./scripts/generate-abis.sh [git-ref]
#
# The default is the deployed filecoin-services v1.6 release. Supplying a ref
# regenerates every fetched ABI from that one ref, and a failed fetch stops the
# script before it writes, so the generated ABIs always come from one ref.
#
# FWSS keeps a union ABI. The deployed v1.6 ABI supplies its current events;
# fwss-extra-events.json retains events emitted by historical FWSS and Storacha
# deployments. SelectorDelegated is verified against the ERC-8167 revision
# deployed with FWSS.
#
# Usage:
#   ./scripts/generate-abis.sh
#   ./scripts/generate-abis.sh v1.6.0
#   ABI_REF=v1.6.0 ./scripts/generate-abis.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PONDER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ABI_DST="${PONDER_DIR}/abis"

REPO="FilOzone/filecoin-services"
ABI_PATH="service_contracts/abi"
REF="${1:-${ABI_REF:-1134986cfd430c457d679c157191757e07d51e1f}}"
ERC8167_REPO="wjmelements/erc8167"
ERC8167_REF="44b41a1a94a491b54920ae8dd3c16aa974b6bf09"
FWSS_EXTRAS="${ABI_DST}/fwss-extra-events.json"

# Contracts we index (skip library/storage/error ABIs).
CONTRACTS=(
  PDPVerifier
  FilecoinWarmStorageService
  FilecoinPayV1
  ServiceProviderRegistry
  SessionKeyRegistry
)

mkdir -p "$ABI_DST"

fetch_abi() {
  local contract="$1"
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/${REF}/${ABI_PATH}/${contract}.abi.json"
}

verify_erc8167_selector_event() {
  local source
  source="$(curl -fsSL "https://raw.githubusercontent.com/${ERC8167_REPO}/${ERC8167_REF}/src/interfaces/IERC8167.sol")"
  grep -Fq "event SelectorDelegated(bytes4 indexed selector, address indexed delegate);" <<<"$source"
}

# Merge event entries without duplicating signatures already present in the
# contract ABI. Tuple component types are part of an event's canonical
# signature, while parameter names and internalType are not.
merge_events() {
  local events="$1"
  jq --argjson events "$events" '
    def input_signature:
      [.type, [(.components // [])[] | input_signature]];
    def event_signature:
      [.name, [.inputs[]? | input_signature]];
    reduce $events[] as $event (.;
      ($event | event_signature) as $signature
      | if any(.[]; .type == "event" and event_signature == $signature)
        then .
        else . + [$event]
        end
    )
  '
}

echo "fetching ABIs from ${REPO}@${REF}"

declare -A ABI_JSON
for contract in "${CONTRACTS[@]}"; do
  if ! abi_json="$(fetch_abi "$contract")"; then
    echo "error: ${contract}.abi.json is unavailable at ${REPO}@${REF}" >&2
    exit 1
  fi
  ABI_JSON["$contract"]="$abi_json"
  jq -e 'type == "array"' >/dev/null <<<"${ABI_JSON[$contract]}" || {
    echo "error: ${contract}.abi.json at ${REPO}@${REF} is not an ABI array" >&2
    exit 1
  }
done

if ! verify_erc8167_selector_event; then
  echo "error: SelectorDelegated is unavailable at ${ERC8167_REPO}@${ERC8167_REF}" >&2
  exit 1
fi

jq -e 'type == "array"' "$FWSS_EXTRAS" >/dev/null || {
  echo "error: ${FWSS_EXTRAS} is not an ABI array" >&2
  exit 1
}

jq -e '
  . as $extras
  | ["CDNPaymentTerminated", "ContractUpgraded", "FilecoinServiceDeployed", "PricingUpdated", "Upgraded", "ViewContractSet", "SelectorDelegated"]
  | all(.[]; . as $name | any($extras[]; .type == "event" and .name == $name))
' "$FWSS_EXTRAS" >/dev/null || {
  echo "error: ${FWSS_EXTRAS} is missing a required historical FWSS event" >&2
  exit 1
}

tmp_dir="$(mktemp -d "${ABI_DST}/.generate-abis.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

for contract in "${CONTRACTS[@]}"; do
  abi_json="${ABI_JSON[$contract]}"

  if [ "$contract" = "FilecoinWarmStorageService" ]; then
    extras="$(jq 'map(del(._comment))' "$FWSS_EXTRAS")"
    before="$(jq 'length' <<<"$abi_json")"
    abi_json="$(merge_events "$extras" <<<"$abi_json")"
    after="$(jq 'length' <<<"$abi_json")"
    echo "  ${contract} (+ $((after - before)) historical events)"
  else
    echo "  ${contract}"
  fi

  printf 'export const %sAbi = %s as const\n' "$contract" "$abi_json" > "${tmp_dir}/${contract}.ts"
done

for contract in "${CONTRACTS[@]}"; do
  mv "${tmp_dir}/${contract}.ts" "${ABI_DST}/${contract}.ts"
done

rmdir "$tmp_dir"
trap - EXIT
echo "done: ${#CONTRACTS[@]} ABI files generated (filecoin-services: ${REF}; erc8167: ${ERC8167_REF})"
