/**
 * Validates table metadata consistency and formatting.
 *
 * table-metadata.ts and ponder.schema.ts both derive from schema-defs.ts, but
 * ponder.schema.ts needs a hand-written export per table; indexer/test/schema-exports
 * guards that pairing. This test validates the metadata itself is well-formed.
 */

import { describe, expect, test } from "vitest"
import { TABLES, STANDARD_COLUMNS, formatTableList, tableCount } from "../src/table-metadata.js"

describe("table metadata", () => {
  test("has tables defined", () => {
    expect(tableCount()).toBeGreaterThan(30)
  })

  test("every table has a description", () => {
    for (const [name, def] of Object.entries(TABLES)) {
      expect(def.description, `${name} missing description`).toBeTruthy()
    }
  })

  test("every table has at least one column", () => {
    for (const [name, def] of Object.entries(TABLES)) {
      expect(Object.keys(def.columns).length, `${name} has no columns`).toBeGreaterThan(0)
    }
  })

  test("column types are valid", () => {
    const validTypes = new Set(["bigint", "int", "text", "hex", "bool"])
    for (const [name, def] of Object.entries(TABLES)) {
      for (const [col, colDef] of Object.entries(def.columns)) {
        expect(validTypes.has(colDef.type), `${name}.${col} has invalid type "${colDef.type}"`).toBe(true)
      }
    }
  })

  test("indexes reference existing columns or standard columns", () => {
    const standardCols = new Set(Object.keys(STANDARD_COLUMNS))
    for (const [name, def] of Object.entries(TABLES)) {
      if (!def.indexes) continue
      const tableCols = new Set([...Object.keys(def.columns), ...standardCols])
      for (const idx of def.indexes) {
        expect(tableCols.has(idx), `${name} indexes "${idx}" which is not a column`).toBe(true)
      }
    }
  })

  test("formatTableList produces non-empty output", () => {
    const list = formatTableList()
    expect(list.length).toBeGreaterThan(500)
    expect(list).toContain("fp_rail_settled")
    expect(list).toContain("fwss_piece_added")
    expect(list).toContain("pdp_possession_proven")
  })

  test("table names use snake_case", () => {
    for (const name of Object.keys(TABLES)) {
      expect(name, `${name} is not snake_case`).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })
})
