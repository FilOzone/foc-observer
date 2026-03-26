import { createConfig } from "ponder"
import { PDPVerifierAbi } from "./abis/PDPVerifier"
import { FilecoinWarmStorageServiceAbi } from "./abis/FilecoinWarmStorageService"
import { FilecoinPayV1Abi } from "./abis/FilecoinPayV1"
import { ServiceProviderRegistryAbi } from "./abis/ServiceProviderRegistry"
import { SessionKeyRegistryAbi } from "./abis/SessionKeyRegistry"

// Mainnet proxy addresses (deployed at v1.0.0, same addresses across UUPS upgrades)
// Source: https://github.com/FilOzone/filecoin-services/blob/main/service_contracts/deployments.json
const MAINNET = {
  PDP_VERIFIER: "0xBADd0B92C1c71d02E7d520f64c0876538fa2557F",
  FWSS: "0x8408502033C418E1bbC97cE9ac48E5528F371A9f",
  FILECOIN_PAY: "0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa",
  SP_REGISTRY: "0xf55dDbf63F1b55c3F1D4FA7e339a68AB7b64A5eB",
  SESSION_KEY_REGISTRY: "0x74FD50525A958aF5d484601E252271f9625231aB",
} as const

// v1.0.0 deployed ~epoch 5,220,000 on mainnet (Nov 2, 2025). Start slightly before.
const START_BLOCK = 5_215_000

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL ?? "postgres://ponder:ponder@localhost:17826/ponder",
  },
  chains: {
    mainnet: {
      id: 314,
      rpc: process.env.RPC_URL ?? "http://localhost:1234/rpc/v1",
      pollingInterval: 30_000,
    },
  },
  accounts: {
    FilecoinPayAccount: {
      address: MAINNET.FILECOIN_PAY,
      chain: "mainnet",
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
  },
  contracts: {
    PDPVerifier: {
      abi: PDPVerifierAbi,
      chain: "mainnet",
      address: MAINNET.PDP_VERIFIER,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
    FWSS: {
      abi: FilecoinWarmStorageServiceAbi,
      chain: "mainnet",
      address: MAINNET.FWSS,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
    FilecoinPay: {
      abi: FilecoinPayV1Abi,
      chain: "mainnet",
      address: MAINNET.FILECOIN_PAY,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
    SPRegistry: {
      abi: ServiceProviderRegistryAbi,
      chain: "mainnet",
      address: MAINNET.SP_REGISTRY,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
    SessionKeyRegistry: {
      abi: SessionKeyRegistryAbi,
      chain: "mainnet",
      address: MAINNET.SESSION_KEY_REGISTRY,
      startBlock: START_BLOCK,
      includeTransactionReceipts: true,
    },
  },
})
