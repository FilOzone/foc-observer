/**
 * Reads live state from FOC contracts via eth_call.
 * Complements Ponder's indexed event data with current contract state.
 */

import { createPublicClient, http, type PublicClient, formatUnits, hexToString } from "viem"
import type { NetworkConfig, NetworkName } from "./networks.js"

const PDP_PRODUCT_TYPE = 0 // ProductType for PDP storage

/** Decode bytes capability value to UTF-8, falling back to hex for non-UTF-8 data. */
function decodeCapabilityValue(hex: `0x${string}`): string {
  try {
    const str = hexToString(hex)
    if (str.includes("\ufffd")) return hex
    // Trim null bytes from right (common with fixed-size bytes)
    return str.replace(/\0+$/, "")
  } catch {
    return hex
  }
}

// Minimal ABIs for the view functions we use

const spRegistryAbi = [
  {
    type: "function",
    name: "getProvider",
    inputs: [{ name: "providerId", type: "uint256" }],
    outputs: [{
      name: "info", type: "tuple", components: [
        { name: "providerId", type: "uint256" },
        {
          name: "info", type: "tuple", components: [
            { name: "serviceProvider", type: "address" },
            { name: "payee", type: "address" },
            { name: "name", type: "string" },
            { name: "description", type: "string" },
            { name: "isActive", type: "bool" },
          ],
        },
      ],
    }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProviderCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "activeProviderCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "providerHasProduct",
    inputs: [
      { name: "providerId", type: "uint256" },
      { name: "productType", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllProductCapabilities",
    inputs: [
      { name: "providerId", type: "uint256" },
      { name: "productType", type: "uint8" },
    ],
    outputs: [
      { name: "isActive", type: "bool" },
      { name: "keys", type: "string[]" },
      { name: "values", type: "bytes[]" },
    ],
    stateMutability: "view",
  },
] as const


const endorsementSetAbi = [
  {
    type: "function",
    name: "getProviderIds",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
] as const

const filecoinPayAbi = [
  {
    type: "function",
    name: "accounts",
    inputs: [
      { name: "token", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [
      { name: "funds", type: "uint256" },
      { name: "lockupCurrent", type: "uint256" },
      { name: "lockupRate", type: "uint256" },
      { name: "lockupLastSettledAt", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAccountInfoIfSettled",
    inputs: [
      { name: "token", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [
      { name: "fundedUntilEpoch", type: "uint256" },
      { name: "currentFunds", type: "uint256" },
      { name: "availableFunds", type: "uint256" },
      { name: "currentLockupRate", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "auctionInfo",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "startPrice", type: "uint88" },
      { name: "startTime", type: "uint168" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "NETWORK_FEE_NUMERATOR",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "NETWORK_FEE_DENOMINATOR",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRail",
    inputs: [{ name: "railId", type: "uint256" }],
    outputs: [{
      name: "", type: "tuple", components: [
        { name: "token", type: "address" },
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "operator", type: "address" },
        { name: "validator", type: "address" },
        { name: "paymentRate", type: "uint256" },
        { name: "lockupPeriod", type: "uint256" },
        { name: "lockupFixed", type: "uint256" },
        { name: "settledUpTo", type: "uint256" },
        { name: "endEpoch", type: "uint256" },
        { name: "commissionRateBps", type: "uint256" },
        { name: "serviceFeeRecipient", type: "address" },
      ],
    }],
    stateMutability: "view",
  },
] as const

const fwssAbi = [
  {
    type: "function",
    name: "VERSION",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getApprovedProviders",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "providerIds", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getApprovedProvidersLength",
    inputs: [],
    outputs: [{ name: "count", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDataSetV2",
    inputs: [{ name: "dataSetId", type: "uint256" }],
    outputs: [{
      name: "info", type: "tuple", components: [
        { name: "dataSetId", type: "uint256" },
        { name: "pdpRailId", type: "uint256" },
        { name: "cacheMissRailId", type: "uint256" },
        { name: "cdnRailId", type: "uint256" },
        { name: "payer", type: "address" },
        { name: "payee", type: "address" },
        { name: "serviceProvider", type: "address" },
        { name: "commissionBps", type: "uint256" },
        { name: "clientDataSetId", type: "uint256" },
        { name: "pdpEndEpoch", type: "uint256" },
        { name: "providerId", type: "uint256" },
        { name: "pendingOneTimePayments", type: "uint96" },
        { name: "lifecycleReserveBalance", type: "uint96" },
        { name: "storageTermsId", type: "bytes32" },
      ],
    }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllDataSetMetadata",
    inputs: [{ name: "dataSetId", type: "uint256" }],
    outputs: [
      { name: "keys", type: "string[]" },
      { name: "values", type: "string[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getStorageTerms",
    inputs: [{ name: "storageTermsId", type: "bytes32" }],
    outputs: [
      {
        name: "terms",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "tokenDecimals", type: "uint8" },
          { name: "salt", type: "bytes32" },
          { name: "pricePerTiBPerMonth", type: "uint96" },
        ],
      },
      { name: "enabled", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "provenThisPeriod",
    inputs: [{ name: "dataSetId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "provingDeadline",
    inputs: [{ name: "setId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPriceList",
    inputs: [],
    outputs: [{
      name: "list",
      type: "tuple",
      components: [
        { name: "token", type: "address" },
        {
          name: "rates",
          type: "tuple",
          components: [
            { name: "storagePerTibPerMonth", type: "uint256" },
            { name: "datasetFeePerMonth", type: "uint256" },
            { name: "cdnEgressPerTib", type: "uint256" },
            { name: "cacheMissEgressPerTib", type: "uint256" },
          ],
        },
        {
          name: "fees",
          type: "tuple",
          components: [
            { name: "createDataSetFee", type: "uint256" },
            { name: "addPiecesBaseFee", type: "uint256" },
            { name: "addPiecesPerPieceFee", type: "uint256" },
            { name: "schedulePieceRemovalsFee", type: "uint256" },
            { name: "terminateFee", type: "uint256" },
          ],
        },
        {
          name: "lockups",
          type: "tuple",
          components: [
            { name: "lifecycleReserveTarget", type: "uint256" },
            { name: "replenishThreshold", type: "uint256" },
            { name: "defaultLockupPeriod", type: "uint256" },
            { name: "cdnLockupAmount", type: "uint256" },
            { name: "cacheMissLockupAmount", type: "uint256" },
            { name: "cdnLockupPeriod", type: "uint256" },
          ],
        },
      ],
    }],
    stateMutability: "view",
  },
] as const

const erc20MetadataAbi = [
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const

const pdpVerifierAbi = [
  {
    type: "function",
    name: "getDataSetLastProvenEpoch",
    inputs: [{ name: "setId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDataSetLeafCount",
    inputs: [{ name: "setId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getActivePieceCount",
    inputs: [{ name: "setId", type: "uint256" }],
    outputs: [{ name: "activeCount", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getNextChallengeEpoch",
    inputs: [{ name: "setId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "dataSetLive",
    inputs: [{ name: "setId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const

interface TokenMetadata {
  decimals: number
  symbol: string
}

// Symbols reported as fact. Any other token's deployer chooses its symbol, so it
// is reduced to a short identifier and marked unverified before agents see it.
const KNOWN_TOKENS: Record<NetworkName, Record<string, TokenMetadata>> = {
  calibnet: {
    "0x0000000000000000000000000000000000000000": { decimals: 18, symbol: "FIL" },
    "0xb3042734b608a1b16e9e86b374a3f3e389b4cdf0": { decimals: 18, symbol: "USDFC" },
  },
  mainnet: {
    "0x0000000000000000000000000000000000000000": { decimals: 18, symbol: "FIL" },
    "0x80b98d3aa09ffff255c3ba4a241111ff1262f045": { decimals: 18, symbol: "USDFC" },
    "0xeb466342c4d449bc9f53a865d5cb90586f405215": { decimals: 6, symbol: "axlUSDC" },
  },
}

export function unverifiedSymbol(symbol: string): string | null {
  const id = symbol.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 16)
  return id.length === 0 ? null : `${id} (unverified)`
}

// Account and auction clients parse these decimal strings; the symbol is a separate field.
function decimalAmount(amount: bigint, decimals: number | undefined, unit = ""): string | null {
  return decimals === undefined ? null : formatUnits(amount, decimals) + unit
}

export class ContractReader {
  readonly network: NetworkConfig
  private client: PublicClient

  constructor(network: NetworkConfig) {
    this.network = network
    this.client = createPublicClient({
      transport: http(network.rpcUrl),
    })
  }

  private async getTokenMetadata(token: `0x${string}`): Promise<TokenMetadata | null> {
    const known = KNOWN_TOKENS[this.network.name][token.toLowerCase()]
    if (known !== undefined) return known

    try {
      const [decimals, symbol] = await Promise.all([
        this.client.readContract({ address: token, abi: erc20MetadataAbi, functionName: "decimals" }),
        this.client.readContract({ address: token, abi: erc20MetadataAbi, functionName: "symbol" }),
      ])
      const unverified = unverifiedSymbol(symbol)
      return unverified === null ? null : { decimals, symbol: unverified }
    } catch {
      return null
    }
  }

  private formatTokenAmount(amount: bigint, metadata: TokenMetadata | null, unit = ""): string | null {
    return metadata ? `${formatUnits(amount, metadata.decimals)} ${metadata.symbol}${unit}` : null
  }

  /** Fetch PDP product capabilities for a provider. Returns null if no PDP product registered. */
  private async getProviderCapabilities(providerId: bigint): Promise<Record<string, string> | null> {
    try {
      const hasProduct = await this.client.readContract({
        address: this.network.contracts.spRegistry,
        abi: spRegistryAbi,
        functionName: "providerHasProduct",
        args: [providerId, PDP_PRODUCT_TYPE],
      })
      if (!hasProduct) return null

      const [isActive, keys, values] = await this.client.readContract({
        address: this.network.contracts.spRegistry,
        abi: spRegistryAbi,
        functionName: "getAllProductCapabilities",
        args: [providerId, PDP_PRODUCT_TYPE],
      })
      if (!isActive) return null

      const caps: Record<string, string> = {}
      for (let i = 0; i < keys.length; i++) {
        caps[keys[i]] = values[i] ? decodeCapabilityValue(values[i]) : ""
      }
      return caps
    } catch {
      return null
    }
  }

  async getProvider(providerId: bigint): Promise<{
    providerId: string
    name: string
    description: string
    serviceProvider: string
    payee: string
    isActive: boolean
    capabilities: Record<string, string> | null
  }> {
    const [result, capabilities] = await Promise.all([
      this.client.readContract({
        address: this.network.contracts.spRegistry,
        abi: spRegistryAbi,
        functionName: "getProvider",
        args: [providerId],
      }),
      this.getProviderCapabilities(providerId),
    ])

    return {
      providerId: result.providerId.toString(),
      name: result.info.name,
      description: result.info.description,
      serviceProvider: result.info.serviceProvider,
      payee: result.info.payee,
      isActive: result.info.isActive,
      capabilities,
    }
  }

  async getProviderCount(): Promise<{ total: string; active: string }> {
    const [total, active] = await Promise.all([
      this.client.readContract({
        address: this.network.contracts.spRegistry,
        abi: spRegistryAbi,
        functionName: "getProviderCount",
      }),
      this.client.readContract({
        address: this.network.contracts.spRegistry,
        abi: spRegistryAbi,
        functionName: "activeProviderCount",
      }),
    ])
    return { total: total.toString(), active: active.toString() }
  }

  async getAllProviders(): Promise<{
    providerId: string
    name: string
    description: string
    serviceProvider: string
    payee: string
    isActive: boolean
    isApproved: boolean
    isEndorsed: boolean
    capabilities: Record<string, string> | null
  }[]> {
    // Fetch provider count, approved set, and endorsed set in parallel
    const [providerCount, approvedCount, endorsedIds] = await Promise.all([
      this.client.readContract({
        address: this.network.contracts.spRegistry,
        abi: spRegistryAbi,
        functionName: "getProviderCount",
      }),
      this.client.readContract({
        address: this.network.contracts.fwss,
        abi: fwssAbi,
        functionName: "getApprovedProvidersLength",
      }),
      this.client.readContract({
        address: this.network.contracts.endorsementSet,
        abi: endorsementSetAbi,
        functionName: "getProviderIds",
      }),
    ])

    const approvedIds = approvedCount > 0n
      ? await this.client.readContract({
          address: this.network.contracts.fwss,
          abi: fwssAbi,
          functionName: "getApprovedProviders",
          args: [0n, approvedCount],
        })
      : []

    const approvedSet = new Set(approvedIds.map((id) => id.toString()))
    const endorsedSet = new Set(endorsedIds.map((id) => id.toString()))

    // Fetch all provider details in parallel
    const count = Number(providerCount)
    const providers = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        this.getProvider(BigInt(i + 1)).catch(() => null)
      ),
    )

    return providers
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p) => ({
        ...p,
        isApproved: approvedSet.has(p.providerId),
        isEndorsed: endorsedSet.has(p.providerId),
      }))
  }

  async getDataset(dataSetId: bigint): Promise<{
    dataSetId: string
    clientDataSetId: string
    providerId: string
    payer: string
    payee: string
    serviceProvider: string
    pdpRailId: string
    cdnRailId: string
    cacheMissRailId: string
    commissionBps: string
    pdpEndEpoch: string
    pendingOneTimePayments: string
    lifecycleReserveBalance: string
    terminated: boolean
    storageTerms: {
      id: string
      token: string
      tokenDecimals: number
      pricePerTiBPerMonth: string
      pricePerTiBPerMonthFormatted: string | null
      enabled: boolean
    }
    metadata: Record<string, string>
  }> {
    const [info, meta] = await Promise.all([
      this.client.readContract({
        address: this.network.contracts.fwss,
        abi: fwssAbi,
        functionName: "getDataSetV2",
        args: [dataSetId],
      }),
      this.client.readContract({
        address: this.network.contracts.fwss,
        abi: fwssAbi,
        functionName: "getAllDataSetMetadata",
        args: [dataSetId],
      }),
    ])
    const [terms, enabled] = await this.client.readContract({
      address: this.network.contracts.fwss,
      abi: fwssAbi,
      functionName: "getStorageTerms",
      args: [info.storageTermsId],
    })
    const tokenMetadata = await this.getTokenMetadata(terms.token)

    const metadata: Record<string, string> = {}
    for (let i = 0; i < meta[0].length; i++) {
      metadata[meta[0][i]] = meta[1][i]
    }

    return {
      dataSetId: info.dataSetId.toString(),
      clientDataSetId: info.clientDataSetId.toString(),
      providerId: info.providerId.toString(),
      payer: info.payer,
      payee: info.payee,
      serviceProvider: info.serviceProvider,
      pdpRailId: info.pdpRailId.toString(),
      cdnRailId: info.cdnRailId.toString(),
      cacheMissRailId: info.cacheMissRailId.toString(),
      commissionBps: info.commissionBps.toString(),
      pdpEndEpoch: info.pdpEndEpoch.toString(),
      pendingOneTimePayments: info.pendingOneTimePayments.toString(),
      lifecycleReserveBalance: info.lifecycleReserveBalance.toString(),
      terminated: info.pdpEndEpoch > 0n,
      storageTerms: {
        id: info.storageTermsId,
        token: terms.token,
        tokenDecimals: terms.tokenDecimals,
        pricePerTiBPerMonth: terms.pricePerTiBPerMonth.toString(),
        pricePerTiBPerMonthFormatted: this.formatTokenAmount(
          terms.pricePerTiBPerMonth,
          tokenMetadata && { ...tokenMetadata, decimals: terms.tokenDecimals },
          "/TiB/month",
        ),
        enabled,
      },
      metadata,
    }
  }

  async getDatasetProving(dataSetId: bigint): Promise<{
    dataSetId: string
    live: boolean
    provenThisPeriod: boolean | null
    lastProvenEpoch: string | null
    provingDeadline: string | null
    nextChallengeEpoch: string | null
    leafCount: string | null
    activePieceCount: string | null
  }> {
    const live = await this.client.readContract({
      address: this.network.contracts.pdpVerifier,
      abi: pdpVerifierAbi,
      functionName: "dataSetLive",
      args: [dataSetId],
    })

    if (!live) {
      return {
        dataSetId: dataSetId.toString(),
        live,
        provenThisPeriod: null,
        lastProvenEpoch: null,
        provingDeadline: null,
        nextChallengeEpoch: null,
        leafCount: null,
        activePieceCount: null,
      }
    }

    const [proven, lastProven, deadline, nextChallenge, leafCount, pieceCount] =
      await Promise.all([
        this.client.readContract({
          address: this.network.contracts.fwss,
          abi: fwssAbi,
          functionName: "provenThisPeriod",
          args: [dataSetId],
        }),
        this.client.readContract({
          address: this.network.contracts.pdpVerifier,
          abi: pdpVerifierAbi,
          functionName: "getDataSetLastProvenEpoch",
          args: [dataSetId],
        }),
        this.client.readContract({
          address: this.network.contracts.fwss,
          abi: fwssAbi,
          functionName: "provingDeadline",
          args: [dataSetId],
        }),
        this.client.readContract({
          address: this.network.contracts.pdpVerifier,
          abi: pdpVerifierAbi,
          functionName: "getNextChallengeEpoch",
          args: [dataSetId],
        }),
        this.client.readContract({
          address: this.network.contracts.pdpVerifier,
          abi: pdpVerifierAbi,
          functionName: "getDataSetLeafCount",
          args: [dataSetId],
        }),
        this.client.readContract({
          address: this.network.contracts.pdpVerifier,
          abi: pdpVerifierAbi,
          functionName: "getActivePieceCount",
          args: [dataSetId],
        }),
      ])

    return {
      dataSetId: dataSetId.toString(),
      live,
      provenThisPeriod: proven,
      lastProvenEpoch: lastProven.toString(),
      provingDeadline: deadline.toString(),
      nextChallengeEpoch: nextChallenge.toString(),
      leafCount: leafCount.toString(),
      activePieceCount: pieceCount.toString(),
    }
  }

  async getAccount(token: `0x${string}`, owner: `0x${string}`): Promise<{
    token: string
    tokenDecimals: number | null
    tokenSymbol: string | null
    owner: string
    funds: string
    fundsFormatted: string | null
    lockupCurrent: string
    lockupCurrentFormatted: string | null
    lockupRate: string
    lockupRateFormatted: string | null
    lockupLastSettledAt: string
    fundedUntilEpoch: string
    currentFunds: string
    currentFundsFormatted: string | null
    availableFunds: string
    availableFundsFormatted: string | null
    currentLockupRate: string
    currentLockupRateFormatted: string | null
  }> {
    const [account, settled, metadata] = await Promise.all([
      this.client.readContract({
        address: this.network.contracts.filecoinPay,
        abi: filecoinPayAbi,
        functionName: "accounts",
        args: [token, owner],
      }),
      this.client.readContract({
        address: this.network.contracts.filecoinPay,
        abi: filecoinPayAbi,
        functionName: "getAccountInfoIfSettled",
        args: [token, owner],
      }),
      this.getTokenMetadata(token),
    ])

    return {
      token,
      tokenDecimals: metadata?.decimals ?? null,
      tokenSymbol: metadata?.symbol ?? null,
      owner,
      funds: account[0].toString(),
      fundsFormatted: decimalAmount(account[0], metadata?.decimals),
      lockupCurrent: account[1].toString(),
      lockupCurrentFormatted: decimalAmount(account[1], metadata?.decimals),
      lockupRate: account[2].toString(),
      lockupRateFormatted: decimalAmount(account[2], metadata?.decimals, "/epoch"),
      lockupLastSettledAt: account[3].toString(),
      fundedUntilEpoch: settled[0].toString(),
      currentFunds: settled[1].toString(),
      currentFundsFormatted: decimalAmount(settled[1], metadata?.decimals),
      availableFunds: settled[2].toString(),
      availableFundsFormatted: decimalAmount(settled[2], metadata?.decimals),
      currentLockupRate: settled[3].toString(),
      currentLockupRateFormatted: decimalAmount(settled[3], metadata?.decimals, "/epoch"),
    }
  }

  async getAuctionStatus(token: `0x${string}`): Promise<{
    token: string
    tokenDecimals: number | null
    tokenSymbol: string | null
    startPrice: string
    startPriceFormatted: string
    startTime: string
    accumulatedFees: string
    accumulatedFeesFormatted: string | null
    networkFeeNumerator: string
    networkFeeDenominator: string
    networkFeePercent: string
  }> {
    const [auction, feeAccount, numerator, denominator, metadata] = await Promise.all([
      this.client.readContract({
        address: this.network.contracts.filecoinPay,
        abi: filecoinPayAbi,
        functionName: "auctionInfo",
        args: [token],
      }),
      this.client.readContract({
        address: this.network.contracts.filecoinPay,
        abi: filecoinPayAbi,
        functionName: "accounts",
        args: [token, this.network.contracts.filecoinPay],
      }),
      this.client.readContract({
        address: this.network.contracts.filecoinPay,
        abi: filecoinPayAbi,
        functionName: "NETWORK_FEE_NUMERATOR",
      }),
      this.client.readContract({
        address: this.network.contracts.filecoinPay,
        abi: filecoinPayAbi,
        functionName: "NETWORK_FEE_DENOMINATOR",
      }),
      this.getTokenMetadata(token),
    ])

    const feePercent = denominator > 0n
      ? `${(Number(numerator) / Number(denominator) * 100).toFixed(2)}%`
      : "0%"

    return {
      token,
      tokenDecimals: metadata?.decimals ?? null,
      tokenSymbol: metadata?.symbol ?? null,
      startPrice: auction[0].toString(),
      startPriceFormatted: `${formatUnits(auction[0], 18)} FIL`,
      startTime: auction[1].toString(),
      accumulatedFees: feeAccount[0].toString(),
      accumulatedFeesFormatted: decimalAmount(feeAccount[0], metadata?.decimals),
      networkFeeNumerator: numerator.toString(),
      networkFeeDenominator: denominator.toString(),
      networkFeePercent: feePercent,
    }
  }

  async getRail(railId: bigint): Promise<{
    railId: string
    token: string
    tokenDecimals: number | null
    tokenSymbol: string | null
    from: string
    to: string
    operator: string
    validator: string
    paymentRate: string
    paymentRateFormatted: string | null
    lockupPeriod: string
    lockupFixed: string
    lockupFixedFormatted: string | null
    settledUpTo: string
    endEpoch: string
    terminated: boolean
    commissionRateBps: string
  }> {
    const rail = await this.client.readContract({
      address: this.network.contracts.filecoinPay,
      abi: filecoinPayAbi,
      functionName: "getRail",
      args: [railId],
    })
    const metadata = await this.getTokenMetadata(rail.token)

    return {
      railId: railId.toString(),
      token: rail.token,
      tokenDecimals: metadata?.decimals ?? null,
      tokenSymbol: metadata?.symbol ?? null,
      from: rail.from,
      to: rail.to,
      operator: rail.operator,
      validator: rail.validator,
      paymentRate: rail.paymentRate.toString(),
      paymentRateFormatted: this.formatTokenAmount(rail.paymentRate, metadata, "/epoch"),
      lockupPeriod: rail.lockupPeriod.toString(),
      lockupFixed: rail.lockupFixed.toString(),
      lockupFixedFormatted: this.formatTokenAmount(rail.lockupFixed, metadata),
      settledUpTo: rail.settledUpTo.toString(),
      endEpoch: rail.endEpoch.toString(),
      terminated: rail.endEpoch > 0n,
      commissionRateBps: rail.commissionRateBps.toString(),
    }
  }

  async getPricing(): Promise<{
    fwssVersion: string
    token: string
    tokenDecimals: number | null
    tokenSymbol: string | null
    storagePrice: string
    storagePriceFormatted: string | null
    datasetFeePerMonth: string
    datasetFeePerMonthFormatted: string | null
    cdnEgressPerTib: string
    cdnEgressPerTibFormatted: string | null
    cacheMissEgressPerTib: string
    cacheMissEgressPerTibFormatted: string | null
    fees: Record<string, string | null>
    lockups: Record<string, string | null>
  }> {
    const [fwssVersion, priceList] = await Promise.all([
      this.client.readContract({
        address: this.network.contracts.fwss,
        abi: fwssAbi,
        functionName: "VERSION",
      }),
      this.client.readContract({
        address: this.network.contracts.fwss,
        abi: fwssAbi,
        functionName: "getPriceList",
      }),
    ])
    const metadata = await this.getTokenMetadata(priceList.token)
    const { rates, fees, lockups } = priceList
    const amounts = (values: Record<string, bigint>) =>
      Object.fromEntries(
        Object.entries(values).flatMap(([name, value]) => [
          [name, value.toString()],
          [`${name}Formatted`, this.formatTokenAmount(value, metadata)],
        ]),
      )

    return {
      fwssVersion,
      token: priceList.token,
      tokenDecimals: metadata?.decimals ?? null,
      tokenSymbol: metadata?.symbol ?? null,
      storagePrice: rates.storagePerTibPerMonth.toString(),
      storagePriceFormatted: this.formatTokenAmount(rates.storagePerTibPerMonth, metadata, "/TiB/month"),
      datasetFeePerMonth: rates.datasetFeePerMonth.toString(),
      datasetFeePerMonthFormatted: this.formatTokenAmount(rates.datasetFeePerMonth, metadata, "/month"),
      cdnEgressPerTib: rates.cdnEgressPerTib.toString(),
      cdnEgressPerTibFormatted: this.formatTokenAmount(rates.cdnEgressPerTib, metadata, "/TiB"),
      cacheMissEgressPerTib: rates.cacheMissEgressPerTib.toString(),
      cacheMissEgressPerTibFormatted: this.formatTokenAmount(rates.cacheMissEgressPerTib, metadata, "/TiB"),
      fees: amounts({ ...fees }),
      lockups: {
        ...amounts({
          lifecycleReserveTarget: lockups.lifecycleReserveTarget,
          replenishThreshold: lockups.replenishThreshold,
          cdnLockupAmount: lockups.cdnLockupAmount,
          cacheMissLockupAmount: lockups.cacheMissLockupAmount,
        }),
        defaultLockupPeriodEpochs: lockups.defaultLockupPeriod.toString(),
        cdnLockupPeriodEpochs: lockups.cdnLockupPeriod.toString(),
      },
    }
  }
}
