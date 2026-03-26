/**
 * Table metadata formatting for agent context.
 *
 * Imports definitions from indexer/src/schema-defs.ts (the single source of truth)
 * and formats them for MCP tool descriptions.
 *
 * The schema-defs.ts file is also used by ponder.schema.ts to generate the
 * actual Postgres tables. One definition, two consumers, no drift.
 */

// Re-export types and data for consumers
// After prebuild copy, schema-defs.ts is a sibling in the same src/ directory
export { TABLES, STANDARD_COLUMNS, type TableDef, type ColDef, type ColType } from "./schema-defs.js"
import { TABLES, STANDARD_COLUMNS } from "./schema-defs.js"

function camelToSnake(s: string): string {
  // Handle consecutive caps (e.g. withCDN -> with_cdn, not with_c_d_n)
  return s.replace(/([A-Z]+)/g, (match, p1, offset) => {
    if (p1.length > 1) {
      return `${offset > 0 ? "_" : ""}${p1.toLowerCase()}`
    }
    return `${offset > 0 ? "_" : ""}${p1.toLowerCase()}`
  })
}

/** Compact format for MCP tool descriptions: table (col:type, col:type) */
export function formatTableList(): string {
  return Object.entries(TABLES).map(([table, meta]) => {
    const cols = Object.entries(meta.columns).map(([name, def]) => {
      let s = `${camelToSnake(name)}:${def.type}`
      if (def.note) s += `: ${def.note}`
      return s
    }).join(", ")
    return `- ${table}: ${meta.description}. (${cols})`
  }).join("\n")
}

/** Standard columns description (documented once, not per table). */
export function formatStandardColumns(): string {
  return Object.entries(STANDARD_COLUMNS)
    .filter(([name]) => name !== "id")
    .map(([name, def]) => {
      let s = `${camelToSnake(name)}:${def.type}`
      if (def.note) s += ` (${def.note})`
      return s
    }).join(", ")
}

/** Count of tables. */
export function tableCount(): number {
  return Object.keys(TABLES).length
}
