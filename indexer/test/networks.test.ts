import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { NETWORKS, parseNetwork, parseStrictEnv, readEnv } from "../src/networks.ts"

const configUrl = new URL("../ponder.config.ts", import.meta.url).href
const inspectConfigScript = `
const config = (await import(${JSON.stringify(configUrl)})).default
const networkName = Object.keys(config.chains)[0]
console.log(JSON.stringify({
  networkName,
  chain: config.chains[networkName],
  database: config.database,
  fwss: {
    chain: config.contracts.FWSS.chain,
    address: config.contracts.FWSS.address,
    startBlock: config.contracts.FWSS.startBlock,
    includeTransactionReceipts: config.contracts.FWSS.includeTransactionReceipts,
  },
}))
`

function loadConfig(environment: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }
  delete env.PONDER_NETWORK
  delete env.PONDER_STRICT_ENV
  delete env.DATABASE_URL
  delete env.RPC_URL
  Object.assign(env, environment)

  return spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", inspectConfigScript], {
    encoding: "utf8",
    env,
  })
}

test("parseNetwork defaults to mainnet only outside strict mode", () => {
  assert.equal(parseNetwork(undefined, false), "mainnet")
  assert.equal(parseNetwork("", false), "mainnet")
  assert.throws(() => parseNetwork(undefined, true), /PONDER_NETWORK is required/)
  assert.throws(() => parseNetwork("", true), /PONDER_NETWORK is required/)
})

test("parseNetwork accepts supported networks and rejects other values", () => {
  assert.equal(parseNetwork("mainnet", false), "mainnet")
  assert.equal(parseNetwork("calibnet", true), "calibnet")
  assert.throws(() => parseNetwork("testnet", false), /Unsupported PONDER_NETWORK "testnet"/)
})

test("parseStrictEnv accepts only the documented enabled values", () => {
  assert.equal(parseStrictEnv("true"), true)
  assert.equal(parseStrictEnv("1"), true)
  assert.equal(parseStrictEnv("false"), false)
  assert.equal(parseStrictEnv(undefined), false)
})

test("readEnv uses overrides and requires values in strict mode", () => {
  assert.equal(readEnv("RPC_URL", "fallback", false, {}), "fallback")
  assert.equal(readEnv("RPC_URL", "fallback", false, { RPC_URL: "override" }), "override")
  assert.throws(() => readEnv("RPC_URL", "fallback", true, {}), /RPC_URL is required/)
  assert.throws(() => readEnv("DATABASE_URL", "fallback", true, { DATABASE_URL: "" }), /DATABASE_URL is required/)
})

test("network registry preserves mainnet deployment configuration", () => {
  assert.deepEqual(NETWORKS.mainnet, {
    CHAIN_ID: 314,
    DATABASE_URL: "postgres://ponder:ponder@localhost:17826/ponder",
    RPC_URL: "http://localhost:1234/rpc/v1",
    START_BLOCK: 5_215_000,
    PDP_VERIFIER: "0xBADd0B92C1c71d02E7d520f64c0876538fa2557F",
    FWSS: "0x8408502033C418E1bbC97cE9ac48E5528F371A9f",
    FILECOIN_PAY: "0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa",
    SP_REGISTRY: "0xf55dDbf63F1b55c3F1D4FA7e339a68AB7b64A5eB",
    SESSION_KEY_REGISTRY: "0x74FD50525A958aF5d484601E252271f9625231aB",
    STORACHA_FWSS: "0x56e53c5e7F27504b810494cc3b88b2aa0645a839",
    FILBEAM_OPERATORS: [
      "0x5f7e5e2a756430edee781ff6e6f7954254ef629a",
      "0xea6631b25ba4c9c9e285da25a03aa96acc921530",
      "0x9e90749d298c4ca43bb468ca859dfe167f9cdcf2",
    ],
  })
})

test("network registry preserves calibnet deployment configuration", () => {
  assert.deepEqual(NETWORKS.calibnet, {
    CHAIN_ID: 314159,
    DATABASE_URL: "postgres://ponder:ponder@localhost:17825/ponder",
    RPC_URL: "http://localhost:1235/rpc/v1",
    START_BLOCK: 3_090_002,
    PDP_VERIFIER: "0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C",
    FWSS: "0x02925630df557F957f70E112bA06e50965417CA0",
    FILECOIN_PAY: "0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0",
    SP_REGISTRY: "0x839e5c9988e4e9977d40708d0094103c0839Ac9D",
    SESSION_KEY_REGISTRY: "0x518411c2062E119Aaf7A8B12A2eDf9a939347655",
    STORACHA_FWSS: "0x0c6875983B20901a7C3c86871f43FdEE77946424",
    FILBEAM_OPERATORS: [
      "0x5f7e5e2a756430edee781ff6e6f7954254ef629a",
      "0x50abae0b3d37a2fa4d3a7f62fbd49f9a566aeb95",
      "0xea6631b25ba4c9c9e285da25a03aa96acc921530",
      "0x5991e4f9fcef4ae23959ee03638b4688a7e1ecff",
    ],
  })
})

test("actual Ponder config rejects unsupported networks and missing strict variables", () => {
  let result = loadConfig({ PONDER_NETWORK: "testnet" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unsupported PONDER_NETWORK "testnet"/)

  result = loadConfig({ PONDER_STRICT_ENV: "true" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /PONDER_NETWORK is required/)

  result = loadConfig({ PONDER_STRICT_ENV: "true", PONDER_NETWORK: "mainnet" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /DATABASE_URL is required/)

  result = loadConfig({
    PONDER_STRICT_ENV: "true",
    PONDER_NETWORK: "mainnet",
    DATABASE_URL: "postgres://noop:noop@localhost/noop",
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /RPC_URL is required/)
})

test("actual Ponder config selects mainnet and calibnet from the environment", () => {
  const databaseUrl = "postgres://noop:noop@localhost/noop"
  const rpcUrl = "http://localhost:1234/rpc/v1"

  for (const expected of [
    { networkName: "mainnet", chainId: 314, fwss: NETWORKS.mainnet.FWSS, startBlock: NETWORKS.mainnet.START_BLOCK },
    { networkName: "calibnet", chainId: 314159, fwss: NETWORKS.calibnet.FWSS, startBlock: NETWORKS.calibnet.START_BLOCK },
  ]) {
    const result = loadConfig({
      PONDER_STRICT_ENV: "true",
      PONDER_NETWORK: expected.networkName,
      DATABASE_URL: databaseUrl,
      RPC_URL: rpcUrl,
    })
    assert.equal(result.status, 0, result.stderr)

    const config = JSON.parse(result.stdout)
    assert.deepEqual(config, {
      networkName: expected.networkName,
      chain: { id: expected.chainId, rpc: rpcUrl, pollingInterval: 30_000 },
      database: { kind: "postgres", connectionString: databaseUrl },
      fwss: {
        chain: expected.networkName,
        address: expected.fwss,
        startBlock: expected.startBlock,
        includeTransactionReceipts: true,
      },
    })
  }
})
