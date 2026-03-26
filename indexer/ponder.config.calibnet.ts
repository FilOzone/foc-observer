import { createConfig } from "ponder"
import { PDPVerifierAbi } from "./abis/PDPVerifier"
import { FilecoinWarmStorageServiceAbi } from "./abis/FilecoinWarmStorageService"
import { FilecoinPayV1Abi } from "./abis/FilecoinPayV1"
import { ServiceProviderRegistryAbi } from "./abis/ServiceProviderRegistry"
import { SessionKeyRegistryAbi } from "./abis/SessionKeyRegistry"

// Calibnet proxy addresses (deployed at v1.0.0, same addresses across UUPS upgrades)
// Source: https://github.com/FilOzone/filecoin-services/blob/main/service_contracts/deployments.json
const CALIBNET = {
  PDP_VERIFIER: "0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C",
  FWSS: "0x02925630df557F957f70E112bA06e50965417CA0",
  FILECOIN_PAY: "0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0",
  SP_REGISTRY: "0x839e5c9988e4e9977d40708d0094103c0839Ac9D",
  SESSION_KEY_REGISTRY: "0x518411c2062E119Aaf7A8B12A2eDf9a939347655",
} as const

// v1.0.0 deployed ~epoch 3,158,000 on calibnet (Nov 2, 2025). Start slightly before.
const START_BLOCK = 3_155_000

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL ?? "postgres://ponder:ponder@localhost:17825/ponder",
  },
  chains: {
    calibnet: {
      id: 314159,
      rpc: process.env.RPC_URL ?? "http://localhost:1235/rpc/v1",
      pollingInterval: 30_000,
    },
  },
  accounts: {
    FilecoinPayAccount: {
      address: CALIBNET.FILECOIN_PAY,
      chain: "calibnet",
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
  },
  contracts: {
    PDPVerifier: {
      abi: PDPVerifierAbi,
      chain: "calibnet",
      address: CALIBNET.PDP_VERIFIER,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
    FWSS: {
      abi: FilecoinWarmStorageServiceAbi,
      chain: "calibnet",
      address: CALIBNET.FWSS,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
    FilecoinPay: {
      abi: FilecoinPayV1Abi,
      chain: "calibnet",
      address: CALIBNET.FILECOIN_PAY,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
    SPRegistry: {
      abi: ServiceProviderRegistryAbi,
      chain: "calibnet",
      address: CALIBNET.SP_REGISTRY,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
    SessionKeyRegistry: {
      abi: SessionKeyRegistryAbi,
      chain: "calibnet",
      address: CALIBNET.SESSION_KEY_REGISTRY,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
  },
})
