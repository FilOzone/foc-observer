/**
 * Reads live state from FOC contracts via eth_call.
 * Complements Ponder's indexed event data with current contract state.
 */

import { createPublicClient, http, type PublicClient, formatUnits, hexToString } from "viem"
import type { NetworkConfig } from "./networks.js"

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

const fwssApprovedAbi = [
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

const fwssStateViewAbi = [
  {
    type: "function",
    name: "getDataSet",
    inputs: [{ name: "dataSetId", type: "uint256" }],
    outputs: [{
      name: "info", type: "tuple", components: [
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
        { name: "dataSetId", type: "uint256" },
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
    name: "getCurrentPricingRates",
    inputs: [],
    outputs: [
      { name: "storagePrice", type: "uint256" },
      { name: "minimumRate", type: "uint256" },
    ],
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

export class ContractReader {
  readonly network: NetworkConfig
  private client: PublicClient

  constructor(network: NetworkConfig) {
    this.network = network
    this.client = createPublicClient({
      transport: http(network.rpcUrl),
    })
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
        address: this.network.contracts.fwssStateView,
        abi: fwssApprovedAbi,
        functionName: "getApprovedProvidersLength",
      }),
      this.client.readContract({
        address: this.network.contracts.endorsementSet,
        abi: endorsementSetAbi,
        functionName: "getProviderIds",
      }),
    ])

    // Fetch all approved provider IDs
    const approvedIds = approvedCount > 0n
      ? await this.client.readContract({
          address: this.network.contracts.fwssStateView,
          abi: fwssApprovedAbi,
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
    terminated: boolean
    metadata: Record<string, string>
  }> {
    const [info, meta] = await Promise.all([
      this.client.readContract({
        address: this.network.contracts.fwssStateView,
        abi: fwssStateViewAbi,
        functionName: "getDataSet",
        args: [dataSetId],
      }),
      this.client.readContract({
        address: this.network.contracts.fwssStateView,
        abi: fwssStateViewAbi,
        functionName: "getAllDataSetMetadata",
        args: [dataSetId],
      }),
    ])

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
      terminated: info.pdpEndEpoch > 0n,
      metadata,
    }
  }

  async getDatasetProving(dataSetId: bigint): Promise<{
    dataSetId: string
    live: boolean
    provenThisPeriod: boolean
    lastProvenEpoch: string
    provingDeadline: string
    nextChallengeEpoch: string
    leafCount: string
    activePieceCount: string
  }> {
    const [live, proven, lastProven, deadline, nextChallenge, leafCount, pieceCount] =
      await Promise.all([
        this.client.readContract({
          address: this.network.contracts.pdpVerifier,
          abi: pdpVerifierAbi,
          functionName: "dataSetLive",
          args: [dataSetId],
        }),
        this.client.readContract({
          address: this.network.contracts.fwssStateView,
          abi: fwssStateViewAbi,
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
          address: this.network.contracts.fwssStateView,
          abi: fwssStateViewAbi,
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
    owner: string
    funds: string
    fundsFormatted: string
    lockupCurrent: string
    lockupCurrentFormatted: string
    lockupRate: string
    lockupRateFormatted: string
    lockupLastSettledAt: string
    fundedUntilEpoch: string
    currentFunds: string
    currentFundsFormatted: string
    availableFunds: string
    availableFundsFormatted: string
    currentLockupRate: string
  }> {
    const [account, settled] = await Promise.all([
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
    ])

    return {
      token,
      owner,
      funds: account[0].toString(),
      fundsFormatted: formatUnits(account[0], 18),
      lockupCurrent: account[1].toString(),
      lockupCurrentFormatted: formatUnits(account[1], 18),
      lockupRate: account[2].toString(),
      lockupRateFormatted: formatUnits(account[2], 18) + "/epoch",
      lockupLastSettledAt: account[3].toString(),
      fundedUntilEpoch: settled[0].toString(),
      currentFunds: settled[1].toString(),
      currentFundsFormatted: formatUnits(settled[1], 18),
      availableFunds: settled[2].toString(),
      availableFundsFormatted: formatUnits(settled[2], 18),
      currentLockupRate: settled[3].toString(),
    }
  }

  async getAuctionStatus(token: `0x${string}`): Promise<{
    token: string
    startPrice: string
    startTime: string
    accumulatedFees: string
    accumulatedFeesFormatted: string
    networkFeeNumerator: string
    networkFeeDenominator: string
    networkFeePercent: string
  }> {
    const [auction, feeAccount, numerator, denominator] = await Promise.all([
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
    ])

    const feePercent = denominator > 0n
      ? `${(Number(numerator) / Number(denominator) * 100).toFixed(2)}%`
      : "0%"

    return {
      token,
      startPrice: auction[0].toString(),
      startTime: auction[1].toString(),
      accumulatedFees: feeAccount[0].toString(),
      accumulatedFeesFormatted: formatUnits(feeAccount[0], 18),
      networkFeeNumerator: numerator.toString(),
      networkFeeDenominator: denominator.toString(),
      networkFeePercent: feePercent,
    }
  }

  /**
   * getRail reverts for finalized (zeroed-out) rails.
   * Callers should handle errors gracefully.
   */
  async getRail(railId: bigint): Promise<{
    railId: string
    from: string
    to: string
    operator: string
    validator: string
    paymentRate: string
    paymentRateFormatted: string
    lockupPeriod: string
    lockupFixed: string
    lockupFixedFormatted: string
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

    return {
      railId: railId.toString(),
      from: rail.from,
      to: rail.to,
      operator: rail.operator,
      validator: rail.validator,
      paymentRate: rail.paymentRate.toString(),
      paymentRateFormatted: formatUnits(rail.paymentRate, 18) + " USDFC/epoch",
      lockupPeriod: rail.lockupPeriod.toString(),
      lockupFixed: rail.lockupFixed.toString(),
      lockupFixedFormatted: formatUnits(rail.lockupFixed, 18) + " USDFC",
      settledUpTo: rail.settledUpTo.toString(),
      endEpoch: rail.endEpoch.toString(),
      terminated: rail.endEpoch > 0n,
      commissionRateBps: rail.commissionRateBps.toString(),
    }
  }

  async getPricing(): Promise<{
    storagePrice: string
    storagePriceFormatted: string
    minimumRate: string
    minimumRateFormatted: string
  }> {
    const [storagePrice, minimumRate] = await this.client.readContract({
      address: this.network.contracts.fwssStateView,
      abi: fwssStateViewAbi,
      functionName: "getCurrentPricingRates",
    })

    return {
      storagePrice: storagePrice.toString(),
      storagePriceFormatted: formatUnits(storagePrice, 18) + " USDFC/TiB/month",
      minimumRate: minimumRate.toString(),
      minimumRateFormatted: formatUnits(minimumRate, 18) + " USDFC/epoch",
    }
  }
}
