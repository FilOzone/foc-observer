import assert from "node:assert/strict"
import { test } from "node:test"
import { FilecoinPayV1Abi } from "../abis/FilecoinPayV1.ts"
import { FilecoinWarmStorageServiceAbi } from "../abis/FilecoinWarmStorageService.ts"
import { PDPVerifierAbi } from "../abis/PDPVerifier.ts"
import { ServiceProviderRegistryAbi } from "../abis/ServiceProviderRegistry.ts"
import { SessionKeyRegistryAbi } from "../abis/SessionKeyRegistry.ts"

type AbiInput = {
  type: string
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
