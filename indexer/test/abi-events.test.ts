import assert from "node:assert/strict"
import { test } from "node:test"
import { FilecoinPayV1Abi } from "../abis/FilecoinPayV1.ts"
import { FilecoinWarmStorageServiceAbi } from "../abis/FilecoinWarmStorageService.ts"
import { PDPVerifierAbi } from "../abis/PDPVerifier.ts"
import { ServiceProviderRegistryAbi } from "../abis/ServiceProviderRegistry.ts"
import { SessionKeyRegistryAbi } from "../abis/SessionKeyRegistry.ts"
import { PoRepMarketAbi } from "../abis/PoRepMarket.ts"
import { PoRepValidatorFactoryAbi } from "../abis/PoRepValidatorFactory.ts"
import { PoRepSPRegistryAbi } from "../abis/PoRepSPRegistry.ts"
import { PoRepSLIOracleAbi } from "../abis/PoRepSLIOracle.ts"

type AbiInput = {
  name?: string
  type: string
  indexed?: boolean
  components?: readonly AbiInput[]
}

type AbiItem = {
  type: string
  name?: string
  inputs?: readonly AbiInput[]
}

const abis = {
  FilecoinPayV1: FilecoinPayV1Abi,
  FilecoinWarmStorageService: FilecoinWarmStorageServiceAbi,
  PDPVerifier: PDPVerifierAbi,
  ServiceProviderRegistry: ServiceProviderRegistryAbi,
  SessionKeyRegistry: SessionKeyRegistryAbi,
  PoRepMarket: PoRepMarketAbi,
  PoRepValidatorFactory: PoRepValidatorFactoryAbi,
  PoRepSPRegistry: PoRepSPRegistryAbi,
  PoRepSLIOracle: PoRepSLIOracleAbi,
}

function canonicalType(input: AbiInput): string {
  if (!input.type.startsWith("tuple")) return input.type
  return `(${(input.components ?? []).map(canonicalType).join(",")})${input.type.slice("tuple".length)}`
}

test("generated ABIs do not contain duplicate event signatures", () => {
  for (const [contract, abi] of Object.entries(abis)) {
    const signatures = new Set<string>()

    for (const item of abi as readonly AbiItem[]) {
      if (item.type !== "event") continue

      const signature = `${item.name}(${(item.inputs ?? []).map(canonicalType).join(",")})`
      assert(!signatures.has(signature), `${contract} contains duplicate event ${signature}`)
      signatures.add(signature)
    }
  }
})

test("FWSS ABI retains deployed and historical event arguments", () => {
  const events = new Map(
    (FilecoinWarmStorageServiceAbi as readonly AbiItem[])
      .filter(item => item.type === "event")
      .map(item => [item.name, item]),
  )
  const requiredEvents = [
    ["CDNPaymentTerminated(uint256,uint256,uint256,uint256)", ["dataSetId", "endEpoch", "cacheMissRailId", "cdnRailId"], [true, false, false, false]],
    ["ContractUpgraded(string,address)", ["version", "implementation"], [false, false]],
    ["DataSetStorageTermsSelected(uint256,bytes32)", ["dataSetId", "storageTermsId"], [true, true]],
    ["DiamondDelegateCall(address,bytes)", ["delegate", "delegateCalldata"], [true, false]],
    ["FilecoinServiceDeployed(string,string)", ["name", "description"], [false, false]],
    ["PricingUpdated(uint256,uint256)", ["storagePrice", "minimumRate"], [false, false]],
    ["SelectorDelegated(bytes4,address)", ["selector", "delegate"], [true, true]],
    ["StorageTermsDisabled(bytes32)", ["storageTermsId"], [true]],
    ["StorageTermsRegistered(bytes32,(address,uint8,bytes32,uint96))", ["storageTermsId", "terms"], [true, false]],
    ["Upgraded(address)", ["implementation"], [true]],
    ["ViewContractSet(address)", ["viewContract"], [true]],
  ] as const

  for (const [signature, inputNames, indexed] of requiredEvents) {
    const [name] = signature.split("(")
    const event = events.get(name)
    assert(event, `FWSS ABI is missing ${signature}`)
    assert.equal(`${event.name}(${(event.inputs ?? []).map(canonicalType).join(",")})`, signature)
    assert.deepEqual((event.inputs ?? []).map(input => input.name), inputNames)
    assert.deepEqual((event.inputs ?? []).map(input => input.indexed), indexed)
  }
})
