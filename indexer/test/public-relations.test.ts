import { execFile as execFileCallback } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFile = promisify(execFileCallback)
const generatorPath = fileURLToPath(new URL("../../postgres/generate-public-relations.mjs", import.meta.url))

test("public relation manifest is current", async () => {
  await execFile(process.execPath, [generatorPath, "--check"])
})
