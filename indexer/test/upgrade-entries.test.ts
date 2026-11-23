import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"

// Upgrade-specific entries share their parent's address and start exactly where
// their events first execute, avoiding empty historical scans.
const configUrl = new URL("../ponder.config.ts", import.meta.url).href
const script = `
const c = (await import(${JSON.stringify(configUrl)})).default.contracts
const pick = (e) => ({ address: e.address, startBlock: e.startBlock })
console.log(JSON.stringify({
  PDPVerifier: pick(c.PDPVerifier), PDPVerifierV35: pick(c.PDPVerifierV35),
  FWSS: pick(c.FWSS), FWSSV14: pick(c.FWSSV14),
  FWSSV15: pick(c.FWSSV15), FWSSV16: pick(c.FWSSV16),
}))
`

function contracts(network: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1", PONDER_NETWORK: network }
  env.DATABASE_URL = "postgres://noop:noop@localhost:5432/noop"
  env.RPC_URL = "http://localhost:1234/rpc/v1"
  delete env.PONDER_STRICT_ENV
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], { encoding: "utf8", env })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split("\n").at(-1)!)
}

for (const [network, expected] of Object.entries({
  mainnet: { v15: 6_482_202, v16: 6_560_696 },
  calibnet: { v15: 4_177_782, v16: 4_256_439 },
})) {
  test(`${network}: upgrade entries share their parent's address and start at execution`, () => {
    const c = contracts(network)
    assert.equal(c.PDPVerifierV35.address, c.PDPVerifier.address)
    assert.ok(c.PDPVerifierV35.startBlock > c.PDPVerifier.startBlock, "PDPVerifierV35 must start after PDPVerifier")
    assert.equal(c.FWSSV14.address, c.FWSS.address)
    assert.equal(c.FWSSV15.address, c.FWSS.address)
    assert.equal(c.FWSSV16.address, c.FWSS.address)
    assert.ok(c.FWSSV14.startBlock > c.PDPVerifierV35.startBlock, "FWSSV14 must start after PDPVerifierV35")
    assert.equal(c.FWSSV15.startBlock, expected.v15)
    assert.equal(c.FWSSV16.startBlock, expected.v16)
    assert.ok(c.FWSSV15.startBlock > c.FWSSV14.startBlock, "FWSSV15 must start after FWSSV14")
    assert.ok(c.FWSSV16.startBlock > c.FWSSV15.startBlock, "FWSSV16 must start after FWSSV15")
  })
}
