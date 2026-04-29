/**
 * SQL validation using libpg-query (the actual Postgres 17 parser compiled to WASM).
 *
 * Security model: ALLOW-LIST, not deny-list. We define what SQL features are
 * permitted and reject everything else. Unknown AST node types, function names,
 * or statement types are rejected by default.
 *
 * Table access uses a positive allow-list derived from the known schema (TABLES)
 * plus CTE/alias names collected during validation. Schema-qualified table
 * references (e.g. information_schema.tables) are always rejected.
 *
 * The parser must be initialized once via initParser() before use.
 */

import { loadModule, parseSync, type SqlError } from "libpg-query"
import { TABLES } from "./schema-defs.js"

let initialized = false

/** Initialize the WASM parser. Call once at startup (~40ms). */
export async function initParser(): Promise<void> {
  if (initialized) return
  await loadModule()
  initialized = true
}

export const MAX_ROWS = 10000

/**
 * Read-only views over Ponder's internal sync tables, exposed in the public
 * schema. These are NOT indexed event tables — they're derived views that
 * surface per-tx metadata (target contract, function selector, gas) for gas
 * analysis. See system-context.ts "Gas analysis" section.
 */
const ALLOWED_VIEWS = ["tx_meta"]

/** The set of real table names (and exposed views) agents are allowed to query. */
const ALLOWED_TABLES = new Set([...Object.keys(TABLES), ...ALLOWED_VIEWS])

/**
 * Validate a SQL query for safe read-only execution.
 * Throws descriptive errors for any disallowed construct.
 * Returns metadata about the query for execution routing.
 */
export function validateSql(sql: string): { isExplain: boolean } {
  if (!initialized) throw new Error("SQL parser not initialized. Call initParser() first.")

  // Strip BOM
  const cleaned = sql.replace(/^\uFEFF/, "").trim()
  if (!cleaned) throw new Error("Empty query.")

  let ast: ReturnType<typeof parseSync>
  try {
    ast = parseSync(cleaned)
  } catch (err) {
    const sqlErr = err as SqlError
    if (sqlErr.sqlDetails) {
      throw new Error(`SQL syntax error: ${sqlErr.sqlDetails.message}`)
    }
    throw new Error(`SQL parse error: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!ast.stmts || ast.stmts.length === 0) {
    throw new Error("Empty query.")
  }

  if (ast.stmts.length > 1) {
    throw new Error("Multiple statements are not allowed. Send one query at a time.")
  }

  const stmt = ast.stmts[0].stmt
  const stmtType = Object.keys(stmt)[0]

  if (stmtType === "ExplainStmt") {
    validateExplain(stmt.ExplainStmt)
    return { isExplain: true }
  }

  if (stmtType !== "SelectStmt") {
    throw new Error(`Only SELECT, WITH, and EXPLAIN queries are allowed. Got: ${stmtType.replace("Stmt", "").toUpperCase()}.`)
  }

  // Collect CTE names so we can distinguish them from real table references
  const cteNames = new Set<string>()
  validateSelect(stmt.SelectStmt, cteNames)
  return { isExplain: false }
}

// ---------------------------------------------------------------------------
// Statement validators
// ---------------------------------------------------------------------------

function validateExplain(node: Record<string, unknown>): void {
  const options = node.options as Array<{ DefElem: { defname: string } }> | undefined
  if (options) {
    for (const opt of options) {
      if (opt.DefElem.defname === "analyze") {
        throw new Error("EXPLAIN ANALYZE is not allowed (it executes the query).")
      }
    }
  }
  const query = node.query as Record<string, unknown>
  if (!query) throw new Error("EXPLAIN without a query.")
  const innerType = Object.keys(query)[0]
  if (innerType !== "SelectStmt") {
    throw new Error("EXPLAIN is only allowed for SELECT queries.")
  }
  validateSelect(query.SelectStmt as Record<string, unknown>, new Set())
}

function validateSelect(node: Record<string, unknown>, cteNames: Set<string>): void {
  // Reject SELECT INTO (creates a table)
  if (node.intoClause) {
    throw new Error("SELECT INTO is not allowed.")
  }

  // Reject FOR UPDATE / FOR SHARE (row locking)
  if (node.lockingClause) {
    throw new Error("FOR UPDATE / FOR SHARE is not allowed.")
  }

  // UNION / INTERSECT / EXCEPT: validate both sides
  if (node.larg) validateSelect(node.larg as Record<string, unknown>, cteNames)
  if (node.rarg) validateSelect(node.rarg as Record<string, unknown>, cteNames)

  // WITH clause (CTEs) -- collect names, reject RECURSIVE
  if (node.withClause) {
    const wc = node.withClause as Record<string, unknown>

    if (wc.recursive) {
      throw new Error("Recursive CTEs (WITH RECURSIVE) are not allowed.")
    }

    const ctes = wc.ctes as Array<Record<string, unknown>> | undefined
    if (ctes) {
      for (const cte of ctes) {
        const cteExpr = cte.CommonTableExpr as Record<string, unknown>
        if (cteExpr) {
          // Register CTE name so table validation knows it's not a real table
          const cteName = cteExpr.ctename as string | undefined
          if (cteName) cteNames.add(cteName)

          const cteQuery = cteExpr.ctequery as Record<string, unknown>
          if (cteQuery) {
            const cteType = Object.keys(cteQuery)[0]
            if (cteType !== "SelectStmt") {
              throw new Error("CTEs may only contain SELECT queries.")
            }
            validateSelect(cteQuery.SelectStmt as Record<string, unknown>, cteNames)
          }
        }
      }
    }
  }

  // Walk all expressions in the SELECT
  walkNode(node, cteNames)
}

// ---------------------------------------------------------------------------
// Recursive AST walker with allow-list
// ---------------------------------------------------------------------------

// AST node types we allow in read-only SELECT queries.
// Anything not in this set is rejected.
const ALLOWED_NODE_TYPES = new Set([
  // Core SELECT structure
  "SelectStmt", "ResTarget", "ColumnRef", "A_Star",

  // Generic containers (used in function args, FROM lists, etc.)
  "List",

  // Expressions
  "A_Const", "A_Expr", "BoolExpr", "NullTest", "BooleanTest",
  "CaseExpr", "CaseWhen", "CoalesceExpr", "MinMaxExpr",
  "NullIfExpr", "A_ArrayExpr", "A_Indirection",

  // Type casting
  "TypeCast", "TypeName",

  // Functions and aggregates
  "FuncCall", "WindowDef", "SortBy",

  // Subqueries
  "SubLink", "RangeSubselect",

  // FROM clause
  "RangeVar", "JoinExpr", "Alias", "RangeFunction",

  // Operators and values
  "String", "Integer", "Float", "Boolean",
  "ParamRef", "ColumnDef", "GroupingSet",

  // Common table expressions
  "CommonTableExpr", "WithClause",

  // FILTER clause on aggregates
  "WindowClause",

  // Row expressions
  "RowExpr",

  // JSON (Postgres 17)
  "JsonConstructorExpr", "JsonObjectAgg", "JsonArrayAgg",
])

// Functions allowed in queries. Lowercase, unqualified names only.
// Schema-qualified calls (e.g. myschema.lower()) are rejected entirely.
const ALLOWED_FUNCTIONS = new Set([
  // Aggregates
  "count", "sum", "avg", "min", "max",
  "array_agg", "string_agg", "bool_and", "bool_or",
  "json_agg", "jsonb_agg", "json_object_agg", "jsonb_object_agg",

  // Conditional / null handling
  "coalesce", "nullif", "greatest", "least",

  // Date/time
  "now", "current_timestamp", "current_date",
  "date_trunc", "date_part", "extract",
  "to_timestamp", "to_date", "to_char",
  "age", "date",
  "make_interval", "make_timestamp",

  // String
  "length", "lower", "upper", "trim", "ltrim", "rtrim",
  "substring", "substr", "replace", "regexp_replace",
  "split_part", "concat", "concat_ws",
  "left", "right", "reverse", "repeat",
  "starts_with", "encode", "decode",
  "position", "strpos", "overlay",
  "lpad", "rpad", "initcap", "ascii", "chr",
  "regexp_match", "regexp_matches",
  "format",

  // Numeric / math
  "abs", "ceil", "ceiling", "floor", "round", "trunc",
  "mod", "power", "sqrt", "sign",
  "log", "ln", "exp",
  "random",

  // Type casting
  "cast",

  // JSON
  "json_build_object", "jsonb_build_object",
  "json_build_array", "jsonb_build_array",
  "json_extract_path", "jsonb_extract_path",
  "json_extract_path_text", "jsonb_extract_path_text",
  "json_array_length", "jsonb_array_length",
  "json_typeof", "jsonb_typeof",
  "jsonb_each", "jsonb_each_text",
  "jsonb_object_keys", "jsonb_array_elements",
  "jsonb_array_elements_text",
  "row_to_json", "to_json", "to_jsonb",
  "jsonb_pretty",
  "json_strip_nulls", "jsonb_strip_nulls",

  // Array
  "array_length", "array_upper", "array_lower",
  "unnest", "array_to_string", "string_to_array",
  "array_remove", "array_position",
  "array_cat", "array_append", "array_prepend",
  "generate_series",

  // Window functions
  "row_number", "rank", "dense_rank", "ntile",
  "lag", "lead", "first_value", "last_value", "nth_value",
  "percent_rank", "cume_dist",

  // Boolean
  "bool",

  // Bytes / hex
  "octet_length", "bit_length",
])

function walkNode(node: unknown, cteNames: Set<string>): void {
  if (node === null || node === undefined) return
  if (typeof node !== "object") return

  if (Array.isArray(node)) {
    for (const item of node) walkNode(item, cteNames)
    return
  }

  const obj = node as Record<string, unknown>

  for (const [key, value] of Object.entries(obj)) {
    // Skip location markers and enum values
    if (key === "location" || key === "op" || key === "limitOption" ||
        key === "boolop" || key === "kind" || key === "defaction" ||
        key === "nulltesttype" || key === "booltesttype" ||
        key === "sortby_dir" || key === "sortby_nulls" ||
        key === "jointype" || key === "sub_link_type" ||
        key === "defname" || key === "relpersistence" ||
        key === "inh" || key === "str" || key === "ival" || key === "fval" ||
        key === "boolval" || key === "bsval" ||
        key === "sval") {
      continue
    }

    // Recognized AST node type: check if allowed
    if (key[0] >= "A" && key[0] <= "Z" && typeof value === "object" && value !== null) {
      if (!ALLOWED_NODE_TYPES.has(key)) {
        throw new Error(`SQL feature not allowed: ${key}.`)
      }

      // Special checks for specific node types
      if (key === "FuncCall") {
        validateFuncCall(value as Record<string, unknown>)
      } else if (key === "RangeVar") {
        validateTableRef(value as Record<string, unknown>, cteNames)
      } else if (key === "SelectStmt") {
        // Nested select: validate fully (inherits CTE names from parent scope)
        validateSelect(value as Record<string, unknown>, cteNames)
        continue // validateSelect already walks children
      }
    }

    walkNode(value, cteNames)
  }
}

function validateFuncCall(node: Record<string, unknown>): void {
  const funcname = node.funcname as Array<{ String: { sval: string } }> | undefined
  if (!funcname || funcname.length === 0) return

  // The Postgres parser rewrites standard SQL syntax like EXTRACT(), OVERLAY(),
  // POSITION() into pg_catalog-qualified calls with funcformat = "COERCE_SQL_SYNTAX".
  // These are safe builtins written in standard SQL, not explicit schema-qualified calls.
  const isSqlSyntax = node.funcformat === "COERCE_SQL_SYNTAX"

  // Reject explicit schema-qualified function calls (e.g. public.lower()).
  // Allow pg_catalog calls only when the parser generated them from SQL syntax.
  if (funcname.length > 1 && !isSqlSyntax) {
    const schema = funcname[0]?.String?.sval ?? ""
    const name = funcname[funcname.length - 1]?.String?.sval ?? ""
    throw new Error(`Schema-qualified function calls are not allowed: ${schema}.${name}(). Use unqualified function names.`)
  }

  const name = funcname[funcname.length - 1]?.String?.sval?.toLowerCase()
  if (!name) return

  // SQL-syntax builtins (EXTRACT, POSITION, OVERLAY, TRIM, etc.) are always safe --
  // the parser generated the pg_catalog qualification, the user wrote standard SQL.
  if (isSqlSyntax) return

  if (!ALLOWED_FUNCTIONS.has(name)) {
    throw new Error(`Function ${name}() is not allowed. Only safe read-only functions are permitted.`)
  }
}

function validateTableRef(node: Record<string, unknown>, cteNames: Set<string>): void {
  const relname = node.relname as string | undefined
  if (!relname) return

  const schemaname = node.schemaname as string | undefined

  // Schema-qualified table references are always rejected.
  // Our event tables are all in the public schema and don't need qualification.
  // This blocks information_schema.*, pg_catalog.*, and any other schema access.
  if (schemaname) {
    throw new Error(`Schema-qualified table access is not allowed: ${schemaname}.${relname}. Query tables directly by name.`)
  }

  // CTE references appear as RangeVar with the CTE name -- allow them
  if (cteNames.has(relname)) return

  // Allow known event tables from our schema
  if (ALLOWED_TABLES.has(relname)) return

  // Reject everything else. This catches system views (pg_roles, pg_user, etc.),
  // Ponder internal tables, and any future tables that aren't in our schema.
  throw new Error(`Table "${relname}" is not a known FOC event table. Use list_tables to see available tables.`)
}
