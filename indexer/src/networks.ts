export type NetworkName = "mainnet" | "calibnet"

type Network = {
  CHAIN_ID: number
  DATABASE_URL: string
  RPC_URL: string
  START_BLOCK: number
  PDP_VERIFIER: `0x${string}`
  FWSS: `0x${string}`
  FILECOIN_PAY: `0x${string}`
  SP_REGISTRY: `0x${string}`
  SESSION_KEY_REGISTRY: `0x${string}`
  STORACHA_FWSS: `0x${string}`
  FILBEAM_OPERATORS: readonly `0x${string}`[]
}

// Proxy addresses are stable across UUPS upgrades.
// Source: https://github.com/FilOzone/filecoin-services/blob/main/service_contracts/deployments.json
export const MAINNET = {
  CHAIN_ID: 314,
  DATABASE_URL: "postgres://ponder:ponder@localhost:17826/ponder",
  RPC_URL: "http://localhost:1234/rpc/v1",
  // v1.0.0 deployed ~epoch 5,220,000 on mainnet (Nov 2, 2025). Start slightly before.
  START_BLOCK: 5_215_000,
  PDP_VERIFIER: "0xBADd0B92C1c71d02E7d520f64c0876538fa2557F",
  FWSS: "0x8408502033C418E1bbC97cE9ac48E5528F371A9f",
  FILECOIN_PAY: "0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa",
  SP_REGISTRY: "0xf55dDbf63F1b55c3F1D4FA7e339a68AB7b64A5eB",
  SESSION_KEY_REGISTRY: "0x74FD50525A958aF5d484601E252271f9625231aB",
  // Storacha runs a separate FWSS-fork listener on the same PDPVerifier and FilecoinPay.
  STORACHA_FWSS: "0x56e53c5e7F27504b810494cc3b88b2aa0645a839",
  // FilBeam CDN bandwidth ledger; non-upgradeable, redeployed periodically.
  // Addresses derived from FWSS:FilBeamControllerChanged event history.
  FILBEAM_OPERATORS: [
    "0x5f7e5e2a756430edee781ff6e6f7954254ef629a", // initial
    "0xea6631b25ba4c9c9e285da25a03aa96acc921530", // v1.0.1
    "0x9e90749d298c4ca43bb468ca859dfe167f9cdcf2", // v1.0.2 (current)
  ],
} as const satisfies Network

export const CALIBNET = {
  CHAIN_ID: 314159,
  DATABASE_URL: "postgres://ponder:ponder@localhost:17825/ponder",
  RPC_URL: "http://localhost:1235/rpc/v1",
  // Snapshot floor is 3,090,000 (null round); start +2 so the parent is valid.
  // Captures FilecoinPay rail 1 (3,125,305) and PDPVerifier sets 1-48 (3,144,601 onward).
  START_BLOCK: 3_090_002,
  PDP_VERIFIER: "0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C",
  FWSS: "0x02925630df557F957f70E112bA06e50965417CA0",
  FILECOIN_PAY: "0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0",
  SP_REGISTRY: "0x839e5c9988e4e9977d40708d0094103c0839Ac9D",
  SESSION_KEY_REGISTRY: "0x518411c2062E119Aaf7A8B12A2eDf9a939347655",
  // Storacha runs a separate FWSS-fork listener on the same PDPVerifier and FilecoinPay.
  STORACHA_FWSS: "0x0c6875983B20901a7C3c86871f43FdEE77946424",
  // FilBeam CDN bandwidth ledger; non-upgradeable, redeployed periodically.
  // Addresses derived from FWSS:FilBeamControllerChanged event history.
  FILBEAM_OPERATORS: [
    "0x5f7e5e2a756430edee781ff6e6f7954254ef629a", // initial
    "0x50abae0b3d37a2fa4d3a7f62fbd49f9a566aeb95", // v1.0.0
    "0xea6631b25ba4c9c9e285da25a03aa96acc921530", // v1.0.1
    "0x5991e4f9fcef4ae23959ee03638b4688a7e1ecff", // v1.0.2 (current)
  ],
} as const satisfies Network

export const NETWORKS = {
  mainnet: MAINNET,
  calibnet: CALIBNET,
} as const satisfies Record<NetworkName, Network>

export function parseStrictEnv(value: string | undefined): boolean {
  return value === "1" || value === "true"
}

export function parseNetwork(value: string | undefined, strict: boolean): NetworkName {
  if (value === undefined || value === "") {
    if (strict) throw new Error("PONDER_NETWORK is required when PONDER_STRICT_ENV=true")
    return "mainnet"
  }
  if (value === "mainnet" || value === "calibnet") return value
  throw new Error(`Unsupported PONDER_NETWORK "${value}". Expected "mainnet" or "calibnet".`)
}

export function readEnv(
  name: string,
  fallback: string,
  strict: boolean,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment[name]
  if (value !== undefined && value !== "") return value
  if (strict) throw new Error(`${name} is required when PONDER_STRICT_ENV=true`)
  return fallback
}
