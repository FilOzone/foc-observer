#!/usr/bin/env bash
#
# Generate TypeScript ABI files from the FOC contract ABI sources.
# Run from the ponder/ directory: ./scripts/generate-abis.sh [git-ref]
#
# Fetches .abi.json files from the filecoin-services GitHub repo and writes
# TypeScript exports to abis/. Falls back to a local checkout if available.
#
# Usage:
#   ./scripts/generate-abis.sh              # Use default ref (v1.1.0)
#   ./scripts/generate-abis.sh v1.2.0       # Use a specific tag
#   ./scripts/generate-abis.sh main         # Use latest from main branch
#   ABI_REF=main ./scripts/generate-abis.sh # Via environment variable

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PONDER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ABI_DST="${PONDER_DIR}/abis"

REPO="FilOzone/filecoin-services"
ABI_PATH="service_contracts/abi"
REF="${1:-${ABI_REF:-v1.2.0}}"

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

  echo "  ${contract}"
  echo "export const ${contract}Abi = ${abi_json} as const" > "$dst"
done

echo "done: $(ls "$ABI_DST"/*.ts 2>/dev/null | wc -l) ABI files generated (ref: ${REF})"
