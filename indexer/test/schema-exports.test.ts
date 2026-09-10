import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { TABLES } from "../src/schema-defs.ts"

// ponder.schema.ts needs one hand-written export per table. schema-defs.ts is the
// source of truth for the definitions, but nothing generates these lines, so a table
// added without its export fails at Ponder build time with no signal from the tests.
const source = readFileSync(fileURLToPath(new URL("../ponder.schema.ts", import.meta.url)), "utf8")
const exported = new Map(
  [...source.matchAll(/export const (\w+) = tables\.(\w+)/g)].map((m) => [m[2] as string, m[1] as string]),
)

test("every table in schema-defs has a ponder.schema export", () => {
  const missing = Object.keys(TABLES).filter((t) => !exported.has(t))
  assert.deepEqual(missing, [], `tables without an export in ponder.schema.ts: ${missing.join(", ")}`)
})

test("every ponder.schema export refers to a real table", () => {
  const orphaned = [...exported.keys()].filter((t) => !(t in TABLES))
  assert.deepEqual(orphaned, [], `exports with no table in schema-defs.ts: ${orphaned.join(", ")}`)
})
