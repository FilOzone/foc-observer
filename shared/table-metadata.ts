import { STANDARD_COLUMNS, TABLES } from "./schema-defs.js"

/** Attach stored units and field semantics to the columns actually served by this network. */
export function columnNotes(table: string): Map<string, string> {
  const notes = new Map<string, string>()
  if (!Object.hasOwn(TABLES, table)) return notes
  for (const [name, def] of Object.entries({ ...STANDARD_COLUMNS, ...TABLES[table].columns })) {
    if (def.note && name !== "id") {
      const column = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").toLowerCase()
      notes.set(column, def.note)
    }
  }
  return notes
}
