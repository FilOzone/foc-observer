import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

// Every handler must record its transaction in tx_meta before doing anything
// else, or the event rows it writes have no join partner and nothing fails.
const srcDir = fileURLToPath(new URL("../src/", import.meta.url))
const sources = readdirSync(srcDir).filter((f) => f.endsWith(".ts") && f !== "tx-meta.ts")

test("every ponder.on handler calls recordTx as its first statement", () => {
  const misplaced: string[] = []
  let handlers = 0
  for (const file of sources) {
    const lines = readFileSync(srcDir + file, "utf8").split("\n")
    lines.forEach((line, i) => {
      if (!line.includes("ponder.on(")) return
      handlers++
      const next = lines.slice(i + 1).find((l) => l.trim() !== "")?.trim()
      if (next !== "await recordTx(event, context)") misplaced.push(`${file}:${i + 1}`)
    })
  }
  assert.ok(handlers > 0, "no handlers found")
  assert.deepEqual(misplaced, [], `handlers not calling recordTx first: ${misplaced.join(", ")}`)
})
