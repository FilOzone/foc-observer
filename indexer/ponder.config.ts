import { createConfig } from "ponder"
import { PDPVerifierAbi } from "./abis/PDPVerifier.ts"
import { FilecoinWarmStorageServiceAbi } from "./abis/FilecoinWarmStorageService.ts"
import { FilecoinPayV1Abi } from "./abis/FilecoinPayV1.ts"
import { ServiceProviderRegistryAbi } from "./abis/ServiceProviderRegistry.ts"
import { SessionKeyRegistryAbi } from "./abis/SessionKeyRegistry.ts"
import { FilBeamOperatorAbi } from "./abis/FilBeamOperator.ts"
import { NETWORKS, parseNetwork, parseStrictEnv, readEnv } from "./src/networks.ts"

const strictEnv = parseStrictEnv(process.env.PONDER_STRICT_ENV)
const networkName = parseNetwork(process.env.PONDER_NETWORK, strictEnv)
const network = NETWORKS[networkName]

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: readEnv("DATABASE_URL", network.DATABASE_URL, strictEnv),
  },
  chains: {
    [networkName]: {
      id: network.CHAIN_ID,
      rpc: readEnv("RPC_URL", network.RPC_URL, strictEnv),
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
    FWSS: {
      abi: FilecoinWarmStorageServiceAbi,
      chain: networkName,
      address: network.FWSS,
      startBlock: network.START_BLOCK,
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
  },
})
