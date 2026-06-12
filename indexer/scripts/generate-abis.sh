#!/usr/bin/env bash
#
# Generate TypeScript ABI files from the FOC contract ABI sources.
# Run from the ponder/ directory: ./scripts/generate-abis.sh [git-ref]
#
# Fetches .abi.json files from the filecoin-services GitHub repo and writes
# TypeScript exports to abis/. Falls back to a local checkout if available.
#
# For FilecoinWarmStorageService we splice in events from internal libraries
# (currently lib/Rails.sol) so Ponder subscribes to them at the FWSS proxy
# address - libraries inline at the call site, so their events emit from the
# FWSS proxy. abis/fwss-extra-events.json carries any further hand-maintained
# entries (eg PricingUpdated retained as a legacy entry for FWSS deployments
# still on v1.2.x).
#
# Default ref is pinned to a commit, NOT a tag, because v1.3.0 predates
# https://github.com/FilOzone/filecoin-services/pull/522, which is what
# publishes abi/Rails.abi.json upstream. Once that PR merges and a tag
# including it is cut, switch the default back to that tag.
#
# Usage:
#   ./scripts/generate-abis.sh              # Use default ref (pinned commit)
#   ./scripts/generate-abis.sh v1.3.1       # Use a specific tag once available
#   ./scripts/generate-abis.sh main         # Use latest from main branch
#   ABI_REF=main ./scripts/generate-abis.sh # Via environment variable

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PONDER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ABI_DST="${PONDER_DIR}/abis"

REPO="FilOzone/filecoin-services"
ABI_PATH="service_contracts/abi"
# Head of rvagg/moar-abis (PR #522). Update when that PR merges and a tagged
# release including abi/Rails.abi.json is cut.
REF="${1:-${ABI_REF:-94b5ba6003f3b094cbb4455cd252b79b9a66862c}}"
FWSS_EXTRAS="${ABI_DST}/fwss-extra-events.json"

# Libraries whose events emit from the FWSS proxy at runtime. Their event
# entries are folded into the FilecoinWarmStorageService ABI so Ponder
# subscribes to them via the FWSS contract.
FWSS_LIBS=(Rails)

# Contracts we index (skip library/storage/error ABIs)
CONTRACTS=(
  PDPVerifier
  FilecoinWarmStorageService
  FilecoinPayV1
  ServiceProviderRegistry
  SessionKeyRegistry
)

mkdir -p "$ABI_DST"

# Try GitHub first, fall back to local checkout
fetch_abi() {
  local contract="$1"
  local url="https://raw.githubusercontent.com/${REPO}/${REF}/${ABI_PATH}/${contract}.abi.json"

  if curl -sf "$url" 2>/dev/null; then
    return 0
  fi

  # Fall back to local path (for development in the FOC monorepo)
  local local_path="${PONDER_DIR}/../contracts/filecoin-services/${ABI_PATH}/${contract}.abi.json"
  if [ -f "$local_path" ]; then
    cat "$local_path"
    return 0
  fi

  return 1
}

echo "fetching ABIs from ${REPO}@${REF}"

for contract in "${CONTRACTS[@]}"; do
  dst="$ABI_DST/${contract}.ts"

  abi_json=$(fetch_abi "$contract") || {
    echo "warning: ${contract}.abi.json not found at ref '${REF}' or locally, skipping"
    continue
  }

  if [ "$contract" = "FilecoinWarmStorageService" ]; then
    spliced=0
    # Fold in events from FWSS-internal libraries.
    for lib in "${FWSS_LIBS[@]}"; do
      lib_json=$(fetch_abi "$lib") || {
        echo "warning: ${lib}.abi.json not found at ref '${REF}' or locally, skipping library splice"
        continue
      }
      lib_events=$(jq '[.[] | select(.type == "event")]' <<<"$lib_json")
      abi_json=$(jq --argjson events "$lib_events" '. + $events' <<<"$abi_json")
      spliced=$((spliced + $(jq 'length' <<<"$lib_events")))
    done
    # Hand-maintained extras (eg legacy events retained for older deployments).
    if [ -f "$FWSS_EXTRAS" ]; then
      extras=$(jq 'map(del(._comment))' "$FWSS_EXTRAS")
      abi_json=$(jq --argjson extras "$extras" '. + $extras' <<<"$abi_json")
      spliced=$((spliced + $(jq 'length' <<<"$extras")))
    fi
    echo "  ${contract} (+ ${spliced} spliced events)"
  else
    echo "  ${contract}"
  fi

  echo "export const ${contract}Abi = ${abi_json} as const" > "$dst"
done

echo "done: $(ls "$ABI_DST"/*.ts 2>/dev/null | wc -l) ABI files generated (ref: ${REF})"
