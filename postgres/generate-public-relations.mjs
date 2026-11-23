#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import { TABLES } from "../indexer/src/schema-defs.ts"

const directory = new URL("./", import.meta.url)
const destination = new URL("public-relations.sql", directory)
const check = process.argv[2] === "--check"

if (process.argv.length > 3 || (process.argv.length === 3 && !check)) {
  throw new Error("Usage: node postgres/generate-public-relations.mjs [--check]")
}

const names = Object.keys(TABLES)
if (!names.length || names.some((name) => !/^[a-z][a-z0-9_]*$/.test(name))) {
  throw new Error("TABLES contains an invalid public relation name")
}

const contents = `-- Generated from indexer/src/schema-defs.ts by postgres/generate-public-relations.mjs. Do not edit.\nCREATE TEMP TABLE foc_observer_allowed_relation (name name PRIMARY KEY);\nINSERT INTO foc_observer_allowed_relation (name) VALUES\n${names.map((name) => `  ('${name}')`).join(",\n")};\n`

if (check) {
  const existing = await readFile(destination, "utf8")
  if (existing !== contents) throw new Error("postgres/public-relations.sql is stale; run node postgres/generate-public-relations.mjs")
} else {
  await writeFile(destination, contents)
}
