import { createConfig } from "ponder"
import { http } from "viem"
import { PDPVerifierAbi } from "./abis/PDPVerifier.ts"
import { FilecoinWarmStorageServiceAbi } from "./abis/FilecoinWarmStorageService.ts"
import { FilecoinPayV1Abi } from "./abis/FilecoinPayV1.ts"
import { ServiceProviderRegistryAbi } from "./abis/ServiceProviderRegistry.ts"
import { SessionKeyRegistryAbi } from "./abis/SessionKeyRegistry.ts"
import { FilBeamOperatorAbi } from "./abis/FilBeamOperator.ts"
import { PoRepMarketAbi } from "./abis/PoRepMarket.ts"
import { PoRepValidatorFactoryAbi } from "./abis/PoRepValidatorFactory.ts"
import { PoRepSPRegistryAbi } from "./abis/PoRepSPRegistry.ts"
import { PoRepSLIOracleAbi } from "./abis/PoRepSLIOracle.ts"
import { NETWORKS, parseNetwork, parseStrictEnv, readEnv } from "./src/networks.ts"

const strictEnv = parseStrictEnv(process.env.PONDER_STRICT_ENV)
const networkName = parseNetwork(process.env.PONDER_NETWORK, strictEnv)
const network = NETWORKS[networkName]

const configuredRpcTimeout = process.env.PONDER_RPC_TIMEOUT_MS
const rpcTimeoutMs = Number(configuredRpcTimeout)

if (
  configuredRpcTimeout !== undefined &&
  (!Number.isSafeInteger(rpcTimeoutMs) || rpcTimeoutMs <= 0)
) {
  throw new Error("PONDER_RPC_TIMEOUT_MS must be a positive integer")
}

function rpcTransport(rpcUrl: string) {
  if (configuredRpcTimeout === undefined) return rpcUrl

  const transport = http(rpcUrl)
  return (opts: Parameters<typeof transport>[0]) =>
    transport({ ...opts, timeout: rpcTimeoutMs })
}

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: readEnv("DATABASE_URL", network.DATABASE_URL, strictEnv),
  },
  chains: {
    [networkName]: {
      id: network.CHAIN_ID,
      rpc: rpcTransport(readEnv("RPC_URL", network.RPC_URL, strictEnv)),
      pollingInterval: 30_000,
    },
  },
  accounts: {
    FilecoinPayAccount: {
      address: network.FILECOIN_PAY,
      chain: networkName,
      startBlock: network.START_BLOCK,
      includeTransactionReceipts: true,
    },
  },
  contracts: {
    PDPVerifier: {
      abi: PDPVerifierAbi,
      chain: networkName,
      address: network.PDP_VERIFIER,
      startBlock: network.START_BLOCK,
      includeTransactionReceipts: true,
    },
    // v3.5.0 events (PiecesAddedV2, PiecesScheduledForRemoval): same address, fetched only from the upgrade.
    PDPVerifierV35: {
      abi: PDPVerifierAbi,
      chain: networkName,
      address: network.PDP_VERIFIER,
      startBlock: network.PDP_VERIFIER_V3_5_BLOCK,
      includeTransactionReceipts: true,
    },
    FWSS: {
      abi: FilecoinWarmStorageServiceAbi,
      chain: networkName,
      address: network.FWSS,
      startBlock: network.START_BLOCK,
      includeTransactionReceipts: true,
    },
    // v1.4.0 events (DataSetAuthorizerSet), likewise.
    FWSSV14: {
      abi: FilecoinWarmStorageServiceAbi,
      chain: networkName,
      address: network.FWSS,
      startBlock: network.FWSS_V1_4_BLOCK,
      includeTransactionReceipts: true,
    },
    FilecoinPay: {
      abi: FilecoinPayV1Abi,
      chain: networkName,
      address: network.FILECOIN_PAY,
      startBlock: network.START_BLOCK,
      includeTransactionReceipts: true,
    },
    SPRegistry: {
      abi: ServiceProviderRegistryAbi,
      chain: networkName,
      address: network.SP_REGISTRY,
      startBlock: network.START_BLOCK,
      includeTransactionReceipts: true,
    },
    SessionKeyRegistry: {
      abi: SessionKeyRegistryAbi,
      chain: networkName,
      address: network.SESSION_KEY_REGISTRY,
      startBlock: network.START_BLOCK,
      includeTransactionReceipts: true,
    },
    StorachaFWSS: {
      abi: FilecoinWarmStorageServiceAbi,
      chain: networkName,
      address: network.STORACHA_FWSS,
      startBlock: network.START_BLOCK,
      includeTransactionReceipts: true,
    },
    FilBeamOperator: {
      abi: FilBeamOperatorAbi,
      chain: networkName,
      address: network.FILBEAM_OPERATORS,
      startBlock: network.START_BLOCK,
      includeTransactionReceipts: true,
    },
    // PoRep Market contracts start at their own deployment block, not START_BLOCK.
    PoRepMarket: {
      abi: PoRepMarketAbi,
      chain: networkName,
      address: network.POREP_MARKET,
      startBlock: network.POREP_START_BLOCK,
      includeTransactionReceipts: true,
    },
    PoRepValidatorFactory: {
      abi: PoRepValidatorFactoryAbi,
      chain: networkName,
      address: network.POREP_VALIDATOR_FACTORY,
      startBlock: network.POREP_START_BLOCK,
      includeTransactionReceipts: true,
    },
    PoRepSPRegistry: {
      abi: PoRepSPRegistryAbi,
      chain: networkName,
      address: network.POREP_SP_REGISTRY,
      startBlock: network.POREP_START_BLOCK,
      includeTransactionReceipts: true,
    },
    PoRepSLIOracle: {
      abi: PoRepSLIOracleAbi,
      chain: networkName,
      address: network.POREP_SLI_ORACLE,
      startBlock: network.POREP_START_BLOCK,
      includeTransactionReceipts: true,
    },
  },
})
