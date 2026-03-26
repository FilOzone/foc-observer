/**
 * Network definitions for FOC Ponder instances and contract addresses.
 * Each network has its own Ponder indexer, Postgres database, GraphQL API,
 * RPC endpoint, and set of deployed contract addresses.
 */

export type NetworkName = "calibnet" | "mainnet"

export interface ContractAddresses {
  pdpVerifier: `0x${string}`
  fwss: `0x${string}`
  fwssStateView: `0x${string}`
  filecoinPay: `0x${string}`
  spRegistry: `0x${string}`
  sessionKeyRegistry: `0x${string}`
  endorsementSet: `0x${string}`
}

export interface NetworkConfig {
  name: NetworkName
  chainId: number
  label: string
  provingPeriodEpochs: number
  epochDurationSeconds: number
  databaseUrl: string
  rpcUrl: string
  subgraphUrl: string
  contracts: ContractAddresses
}

// v1.1.0 deployment addresses from filecoin-services deployments.json
const DEFAULTS: Record<NetworkName, NetworkConfig> = {
  calibnet: {
    name: "calibnet",
    chainId: 314159,
    label: "Calibration testnet",
    provingPeriodEpochs: 240,
    epochDurationSeconds: 30,
    databaseUrl: "postgres://ponder:ponder@localhost:17825/ponder",
    rpcUrl: "http://localhost:1235/rpc/v1",
    subgraphUrl: "https://api.goldsky.com/api/public/project_cmdfaaxeuz6us01u359yjdctw/subgraphs/pdp-explorer/calibration311a/gn",
    contracts: {
      pdpVerifier: "0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C",
      fwss: "0x02925630df557F957f70E112bA06e50965417CA0",
      fwssStateView: "0x53d235D474585EC102ccaB7e0cdcE951dD00f716",
      filecoinPay: "0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0",
      spRegistry: "0x839e5c9988e4e9977d40708d0094103c0839Ac9D",
      sessionKeyRegistry: "0x518411c2062E119Aaf7A8B12A2eDf9a939347655",
      endorsementSet: "0xAA2f7CfC7ecAc616EC9C1f6d700fAd19087FAC84",
    },
  },
  mainnet: {
    name: "mainnet",
    chainId: 314,
    label: "Filecoin mainnet",
    provingPeriodEpochs: 2880,
    epochDurationSeconds: 30,
    databaseUrl: "postgres://ponder:ponder@localhost:17826/ponder",
    rpcUrl: "http://localhost:1234/rpc/v1",
    subgraphUrl: "https://api.goldsky.com/api/public/project_cmdfaaxeuz6us01u359yjdctw/subgraphs/pdp-explorer/mainnet311b/gn",
    contracts: {
      pdpVerifier: "0xBADd0B92C1c71d02E7d520f64c0876538fa2557F",
      fwss: "0x8408502033C418E1bbC97cE9ac48E5528F371A9f",
      fwssStateView: "0x638a4986332bF9B889E5D7435B966C5ecdE077Fa",
      filecoinPay: "0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa",
      spRegistry: "0xf55dDbf63F1b55c3F1D4FA7e339a68AB7b64A5eB",
      sessionKeyRegistry: "0x74FD50525A958aF5d484601E252271f9625231aB",
      endorsementSet: "0x59eFa2e8324E1551d46010d7B0B140eE2F5c726b",
    },
  },
}

/**
 * Resolve network config with environment variable overrides.
 * Env vars are per-network: FOC_CALIBNET_DATABASE_URL, FOC_MAINNET_RPC_URL, etc.
 * Falls back to hardcoded localhost defaults (for local dev without Docker).
 */
export function getNetworkConfig(
  name: NetworkName,
  overrides?: { databaseUrl?: string; rpcUrl?: string; subgraphUrl?: string },
): NetworkConfig {
  const prefix = `FOC_${name.toUpperCase()}_`
  const config = { ...DEFAULTS[name], contracts: { ...DEFAULTS[name].contracts } }
  config.databaseUrl = overrides?.databaseUrl ?? process.env[`${prefix}DATABASE_URL`] ?? config.databaseUrl
  config.rpcUrl = overrides?.rpcUrl ?? process.env[`${prefix}RPC_URL`] ?? config.rpcUrl
  config.subgraphUrl = overrides?.subgraphUrl ?? process.env[`${prefix}SUBGRAPH_URL`] ?? config.subgraphUrl
  return config
}

export function resolveNetworkFromEnv(): NetworkName {
  const env = process.env.FOC_NETWORK
  if (env === "mainnet" || env === "calibnet") return env
  return "calibnet"
}

export const ALL_NETWORKS: NetworkName[] = ["calibnet", "mainnet"]
