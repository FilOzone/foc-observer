import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"

// PDPVerifierV35 and FWSSV14 share an address with their parent entries but start at
// the upgrade that introduced their events, so those fragments fetch only the range
// where the events can exist.
const configUrl = new URL("../ponder.config.ts", import.meta.url).href
const script = `
const c = (await import(${JSON.stringify(configUrl)})).default.contracts
const pick = (e) => ({ address: e.address, startBlock: e.startBlock })
console.log(JSON.stringify({
  PDPVerifier: pick(c.PDPVerifier), PDPVerifierV35: pick(c.PDPVerifierV35),
  FWSS: pick(c.FWSS), FWSSV14: pick(c.FWSSV14),
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

for (const network of ["mainnet", "calibnet"]) {
  test(`${network}: upgrade entries share their parent's address and start later`, () => {
    const c = contracts(network)
    assert.equal(c.PDPVerifierV35.address, c.PDPVerifier.address)
    assert.ok(c.PDPVerifierV35.startBlock > c.PDPVerifier.startBlock, "PDPVerifierV35 must start after PDPVerifier")
    assert.equal(c.FWSSV14.address, c.FWSS.address)
    assert.ok(c.FWSSV14.startBlock > c.FWSS.startBlock, "FWSSV14 must start after FWSS")
    // FWSS v1.4.0 executed after PDPVerifier v3.5.0 on both networks.
    assert.ok(c.FWSSV14.startBlock > c.PDPVerifierV35.startBlock)
  })
}
