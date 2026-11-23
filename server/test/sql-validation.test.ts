import { beforeAll, describe, expect, test } from "vitest"
import { InputError } from "../src/inputs.js"
import { MAX_SQL_LENGTH, initParser, validateSql } from "../src/sql-validator.js"

beforeAll(async () => {
  await initParser()
})

describe("SQL validation (libpg-query AST allow-list)", () => {
  // -- Allowed queries --

  test("allows SELECT", () => {
    expect(() => validateSql("SELECT 1")).not.toThrow()
  })

  test("allows select (case insensitive)", () => {
    expect(() => validateSql("select count(*) from fp_deposit")).not.toThrow()
  })

  test("allows WITH (CTE)", () => {
    expect(() => validateSql("WITH x AS (SELECT 1) SELECT * FROM x")).not.toThrow()
  })

  test("allows EXPLAIN SELECT", () => {
    expect(() => validateSql("EXPLAIN SELECT 1")).not.toThrow()
  })

  test("allows leading whitespace", () => {
    expect(() => validateSql("  \n  SELECT 1")).not.toThrow()
  })

  test("allows SQL comments before query", () => {
    expect(() => validateSql("-- DealBot dataset creation\nSELECT * FROM fwss_data_set_created LIMIT 5")).not.toThrow()
  })

  test("allows block comments", () => {
    expect(() => validateSql("/* aggregation */ SELECT COUNT(*) FROM fp_deposit")).not.toThrow()
  })

  test("allows tx_meta as a table", () => {
    expect(() => validateSql("SELECT * FROM tx_meta")).not.toThrow()
  })

  test("allows joining tx_meta on tx_hash", () => {
    expect(() =>
      validateSql("SELECT s.rail_id, m.tx_from FROM fp_rail_settled s JOIN tx_meta m USING (tx_hash)"),
    ).not.toThrow()
  })

  test("allows string literals with special characters", () => {
    expect(() => validateSql("SELECT * FROM fwss_data_set_created WHERE source = 'foo;bar'")).not.toThrow()
  })

  test("allows FOC event tables", () => {
    expect(() => validateSql("SELECT * FROM fp_deposit LIMIT 10")).not.toThrow()
    expect(() => validateSql("SELECT * FROM fwss_fault_record")).not.toThrow()
    expect(() => validateSql("SELECT * FROM pdp_possession_proven")).not.toThrow()
  })

  test("allows JOINs", () => {
    expect(() => validateSql(
      "SELECT d.data_set_id FROM fwss_data_set_created d LEFT JOIN fwss_service_terminated t ON d.data_set_id = t.data_set_id",
    )).not.toThrow()
  })

  test("allows GROUP BY with aggregates", () => {
    expect(() => validateSql(
      "SELECT source, COUNT(*) as total FROM fwss_data_set_created GROUP BY source ORDER BY total DESC",
    )).not.toThrow()
  })

  test("allows date functions", () => {
    expect(() => validateSql(
      "SELECT date_trunc('day', TO_TIMESTAMP(timestamp)) as day, COUNT(*) FROM fp_deposit GROUP BY day",
    )).not.toThrow()
  })

  test("allows CASE expressions", () => {
    expect(() => validateSql(
      "SELECT CASE WHEN amount > 0 THEN 'positive' ELSE 'zero' END FROM fp_deposit",
    )).not.toThrow()
  })

  test("allows subqueries in WHERE", () => {
    expect(() => validateSql(
      "SELECT * FROM fp_deposit WHERE amount > (SELECT AVG(amount) FROM fp_deposit)",
    )).not.toThrow()
  })

  test("allows subqueries in FROM", () => {
    expect(() => validateSql(
      "SELECT * FROM (SELECT data_set_id, COUNT(*) as cnt FROM fwss_piece_added GROUP BY data_set_id) sub WHERE cnt > 10",
    )).not.toThrow()
  })

  test("allows UNION", () => {
    expect(() => validateSql(
      "SELECT data_set_id FROM fwss_data_set_created UNION SELECT data_set_id FROM fwss_service_terminated",
    )).not.toThrow()
  })

  test("allows COALESCE and NULLIF", () => {
    expect(() => validateSql("SELECT COALESCE(source, 'unknown'), NULLIF(source, '') FROM fwss_data_set_created")).not.toThrow()
  })

  test("allows window functions", () => {
    expect(() => validateSql(
      "SELECT data_set_id, ROW_NUMBER() OVER (ORDER BY timestamp) FROM fwss_data_set_created",
    )).not.toThrow()
  })

  test("allows FILTER clause on aggregates", () => {
    expect(() => validateSql(
      "SELECT COUNT(*) FILTER (WHERE source = 'dealbot') FROM fwss_data_set_created",
    )).not.toThrow()
  })

  test("allows type casts", () => {
    expect(() => validateSql("SELECT amount::text FROM fp_deposit")).not.toThrow()
    expect(() => validateSql("SELECT CAST(amount AS text) FROM fp_deposit")).not.toThrow()
  })

  test("allows HAVING", () => {
    expect(() => validateSql(
      "SELECT source, COUNT(*) as c FROM fwss_data_set_created GROUP BY source HAVING COUNT(*) > 5",
    )).not.toThrow()
  })

  test("allows DISTINCT and DISTINCT ON", () => {
    expect(() => validateSql("SELECT DISTINCT source FROM fwss_data_set_created")).not.toThrow()
  })

  test("allows input-sized JSON and array expansion", () => {
    expect(() => validateSql(
      "SELECT jsonb_array_elements(piece_ids::jsonb) FROM pdp_pieces_added",
    )).not.toThrow()
    expect(() => validateSql(
      "SELECT jsonb_array_elements_text(piece_ids::jsonb) FROM pdp_pieces_added",
    )).not.toThrow()
    expect(() => validateSql(
      "SELECT key FROM jsonb_object_keys('{\"a\": 1}'::jsonb) AS expanded(key)",
    )).not.toThrow()
    expect(() => validateSql(
      "SELECT key, value FROM jsonb_each('{\"a\": 1}'::jsonb) AS entry(key, value)",
    )).not.toThrow()
    expect(() => validateSql(
      "SELECT key, value FROM jsonb_each_text('{\"a\": \"1\"}'::jsonb) AS entry(key, value)",
    )).not.toThrow()
    expect(() => validateSql(
      "SELECT regexp_matches(source, '(.)', 'g') FROM fwss_data_set_created",
    )).not.toThrow()
    expect(() => validateSql("SELECT value FROM unnest(ARRAY[1, 2]) AS expanded(value)")).not.toThrow()
  })

  test.each([
    "SELECT * FROM generate_series(0, 9999)",
    "SELECT * FROM generate_series(1, 10, 3)",
    "SELECT generate_series(1, piece_count) FROM pdp_pieces_added",
  ])("blocks generate_series: %s", (sql) => {
    expect(() => validateSql(sql)).toThrow(/generate_series.*not allowed/)
  })

  test.each([
    ["SELECT string_agg(source, ',') FROM fwss_data_set_created", "string_agg"],
    ["SELECT array_agg(source) FROM fwss_data_set_created", "array_agg"],
    ["SELECT json_agg(source) FROM fwss_data_set_created", "json_agg"],
    ["SELECT jsonb_agg(source) FROM fwss_data_set_created", "jsonb_agg"],
  ])("blocks memory-growing aggregate %s", (sql, functionName) => {
    expect(() => validateSql(sql)).toThrow(new RegExp(`${functionName}.*not allowed`))
  })

  test("allows string functions", () => {
    expect(() => validateSql("SELECT lower(source), length(source), concat(source, '-test') FROM fwss_data_set_created")).not.toThrow()
  })

  test("allows bounded JSON functions", () => {
    expect(() => validateSql("SELECT jsonb_array_length(pieces::jsonb), to_jsonb(piece_count) FROM pdp_pieces_added")).not.toThrow()
  })

  test("allows statistical aggregates", () => {
    expect(() => validateSql("SELECT stddev(amount), stddev_samp(amount), stddev_pop(amount) FROM fp_deposit")).not.toThrow()
    expect(() => validateSql("SELECT variance(amount), var_samp(amount), var_pop(amount) FROM fp_deposit")).not.toThrow()
    expect(() => validateSql("SELECT corr(amount, block_number), covar_pop(amount, block_number), covar_samp(amount, block_number) FROM fp_deposit")).not.toThrow()
  })

  test("allows ordered-set aggregates (WITHIN GROUP)", () => {
    expect(() => validateSql("SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) FROM fp_deposit")).not.toThrow()
    expect(() => validateSql("SELECT percentile_disc(0.9) WITHIN GROUP (ORDER BY amount) AS p90 FROM fp_deposit")).not.toThrow()
    expect(() => validateSql("SELECT mode() WITHIN GROUP (ORDER BY amount) FROM fp_deposit")).not.toThrow()
  })

  test("ordered-set WITHIN GROUP does not bypass function validation", () => {
    expect(() => validateSql("SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY pg_read_file('/etc/passwd')) FROM fp_deposit")).toThrow(/pg_read_file.*not allowed/)
  })

  test("ordered-set WITHIN GROUP does not bypass table validation", () => {
    expect(() => validateSql("SELECT mode() WITHIN GROUP (ORDER BY (SELECT COUNT(*) FROM pg_shadow)) FROM fp_deposit")).toThrow(/not a known FOC event table/)
  })

  test("strips BOM prefix", () => {
    expect(() => validateSql("\uFEFFSELECT 1")).not.toThrow()
  })

  // -- Blocked statement types --

  test("blocks DROP", () => {
    expect(() => validateSql("DROP TABLE fp_deposit")).toThrow(/Only SELECT/)
  })

  test("blocks INSERT", () => {
    expect(() => validateSql("INSERT INTO fp_deposit VALUES (1)")).toThrow(/Only SELECT/)
  })

  test("blocks UPDATE", () => {
    expect(() => validateSql("UPDATE fp_deposit SET amount = 0")).toThrow(/Only SELECT/)
  })

  test("blocks DELETE", () => {
    expect(() => validateSql("DELETE FROM fp_deposit")).toThrow(/Only SELECT/)
  })

  test("blocks COPY", () => {
    expect(() => validateSql("COPY fp_deposit TO STDOUT")).toThrow(/Only SELECT/)
  })

  test("blocks SET", () => {
    expect(() => validateSql("SET TRANSACTION READ WRITE")).toThrow(/Only SELECT/)
  })

  test("blocks SHOW", () => {
    expect(() => validateSql("SHOW server_version")).toThrow(/Only SELECT/)
  })

  test("blocks CREATE", () => {
    expect(() => validateSql("CREATE TABLE foo (id int)")).toThrow(/Only SELECT/)
  })

  test("blocks GRANT", () => {
    expect(() => validateSql("GRANT ALL ON fp_deposit TO public")).toThrow(/Only SELECT/)
  })

  // -- EXPLAIN ANALYZE --

  test("blocks EXPLAIN ANALYZE", () => {
    expect(() => validateSql("EXPLAIN ANALYZE SELECT 1")).toThrow(/EXPLAIN ANALYZE/)
  })

  test("blocks explain analyze (case insensitive)", () => {
    expect(() => validateSql("explain analyze select 1")).toThrow(/EXPLAIN ANALYZE/)
  })

  test("blocks EXPLAIN (ANALYZE) option form", () => {
    expect(() => validateSql("EXPLAIN (FORMAT JSON, ANALYZE) SELECT 1")).toThrow(/EXPLAIN ANALYZE/)
  })

  test("flags EXPLAIN for execution routing", () => {
    expect(validateSql("EXPLAIN SELECT 1").isExplain).toBe(true)
    expect(validateSql("SELECT 1").isExplain).toBe(false)
  })

  test("blocks EXPLAIN of non-SELECT statements", () => {
    expect(() => validateSql("EXPLAIN DELETE FROM fp_deposit")).toThrow(/only allowed for SELECT/)
  })

  test("validates the query inside EXPLAIN", () => {
    expect(() => validateSql("EXPLAIN SELECT * FROM pg_roles")).toThrow(/not a known FOC event table/)
  })

  test("blocks data-modifying CTEs", () => {
    expect(() => validateSql("WITH d AS (DELETE FROM fp_deposit RETURNING *) SELECT * FROM d")).toThrow(/CTEs may only contain SELECT/)
  })

  // -- SELECT INTO / FOR UPDATE --

  test("blocks SELECT INTO", () => {
    expect(() => validateSql("SELECT 1 INTO foo")).toThrow(/SELECT INTO/)
  })

  test("blocks FOR UPDATE", () => {
    expect(() => validateSql("SELECT * FROM fp_deposit FOR UPDATE")).toThrow(/FOR UPDATE/)
  })

  test("blocks FOR SHARE", () => {
    expect(() => validateSql("SELECT * FROM fp_deposit FOR SHARE")).toThrow(/FOR UPDATE/)
  })

  // -- Table allow-list (only known FOC event tables are accessible) --

  test("blocks system views (pg_shadow)", () => {
    expect(() => validateSql("SELECT * FROM pg_shadow")).toThrow(/not a known FOC event table/)
  })

  test("blocks system views (pg_roles)", () => {
    expect(() => validateSql("SELECT * FROM pg_roles")).toThrow(/not a known FOC event table/)
  })

  test("blocks system views (pg_stat_activity)", () => {
    expect(() => validateSql("SELECT * FROM pg_stat_activity")).toThrow(/not a known FOC event table/)
  })

  test("blocks schema-qualified access (pg_catalog)", () => {
    expect(() => validateSql("SELECT * FROM pg_catalog.pg_class")).toThrow(/Schema-qualified table access/)
  })

  test("blocks schema-qualified access (information_schema)", () => {
    expect(() => validateSql("SELECT * FROM information_schema.tables")).toThrow(/Schema-qualified table access/)
  })

  test("blocks unknown tables", () => {
    expect(() => validateSql("SELECT * FROM some_random_table")).toThrow(/not a known FOC event table/)
  })

  test("blocks system catalogs in subqueries", () => {
    expect(() => validateSql("SELECT * FROM fp_deposit WHERE 1 IN (SELECT 1 FROM pg_shadow)")).toThrow(/not a known FOC event table/)
  })

  test("blocks system catalogs in CTEs", () => {
    expect(() => validateSql("WITH x AS (SELECT * FROM pg_roles) SELECT * FROM x")).toThrow(/not a known FOC event table/)
  })

  test("allows CTE name references", () => {
    expect(() => validateSql("WITH my_cte AS (SELECT 1 as x) SELECT * FROM my_cte")).not.toThrow()
  })

  // -- CTE scoping: a CTE name only whitelists references Postgres resolves to that CTE --

  test("blocks a catalog reached by naming a CTE after it in a sibling subquery", () => {
    expect(() => validateSql(
      "SELECT r.rolname FROM (WITH pg_roles AS (SELECT 1 AS x) SELECT * FROM pg_roles) a, pg_roles r",
    )).toThrow(/"pg_roles" is not a known FOC event table/)
  })

  test("blocks a catalog reached by naming a CTE after it in a sibling CTE", () => {
    expect(() => validateSql(
      "WITH a AS (WITH pg_roles AS (SELECT 1) SELECT 1), b AS (SELECT rolname FROM pg_roles) SELECT * FROM b",
    )).toThrow(/"pg_roles" is not a known FOC event table/)
  })

  test("blocks a CTE body referencing its own name", () => {
    expect(() => validateSql(
      "WITH pg_roles AS (SELECT rolname FROM pg_roles) SELECT * FROM pg_roles",
    )).toThrow(/"pg_roles" is not a known FOC event table/)
  })

  test("blocks a CTE body referencing a later sibling's name", () => {
    expect(() => validateSql(
      "WITH a AS (SELECT * FROM pg_roles), pg_roles AS (SELECT 1 AS x) SELECT * FROM a",
    )).toThrow(/"pg_roles" is not a known FOC event table/)
  })

  test("allows a CTE body referencing an earlier sibling", () => {
    expect(() => validateSql("WITH a AS (SELECT 1 AS x), b AS (SELECT x FROM a) SELECT * FROM b")).not.toThrow()
  })

  test("allows subqueries to reference an enclosing CTE", () => {
    expect(() => validateSql(
      "WITH a AS (SELECT 1 AS x) SELECT * FROM (SELECT x FROM a) s WHERE EXISTS (SELECT 1 FROM a)",
    )).not.toThrow()
  })

  test("allows set-operation branches to reference the enclosing CTE", () => {
    expect(() => validateSql("WITH a AS (SELECT 1 AS x) SELECT x FROM a UNION ALL SELECT x FROM a")).not.toThrow()
  })

  test("allows a parenthesised set-operation branch with its own CTE", () => {
    expect(() => validateSql(
      "(WITH a AS (SELECT 1 AS x) SELECT x FROM a) UNION ALL SELECT set_id FROM pdp_data_set_created",
    )).not.toThrow()
  })

  test("blocks CTE SEARCH and CYCLE clauses", () => {
    expect(() => validateSql("WITH a AS (SELECT 1 AS x) SEARCH DEPTH FIRST BY x SET ord SELECT * FROM a")).toThrow(/SEARCH and CYCLE/)
    expect(() => validateSql("WITH a AS (SELECT 1 AS x) CYCLE x SET c USING p SELECT * FROM a")).toThrow(/SEARCH and CYCLE/)
  })

  test("validates deeply nested WITH in linear time", () => {
    let sql = "SELECT 1"
    for (let i = 0; i < 200; i++) sql = `WITH a AS (${sql}) SELECT 1`
    const start = performance.now()
    validateSql(sql)
    expect(performance.now() - start).toBeLessThan(500)
  })

  test("blocks a set-operation branch borrowing a CTE from its sibling", () => {
    expect(() => validateSql(
      "(WITH pg_roles AS (SELECT 1 AS x) SELECT x FROM pg_roles) UNION ALL (SELECT 1 FROM pg_roles)",
    )).toThrow(/"pg_roles" is not a known FOC event table/)
  })

  // -- Recursive CTEs blocked --

  test("blocks WITH RECURSIVE", () => {
    expect(() => validateSql("WITH RECURSIVE x AS (SELECT 1 UNION ALL SELECT 1) SELECT * FROM x")).toThrow(/Recursive CTEs/)
  })

  // -- Schema-qualified functions blocked --

  test("blocks schema-qualified function calls", () => {
    expect(() => validateSql("SELECT public.lower('X')")).toThrow(/Schema-qualified function/)
  })

  test("blocks explicit pg_catalog qualified function calls", () => {
    expect(() => validateSql("SELECT pg_catalog.lower('X')")).toThrow(/Schema-qualified function/)
  })

  // -- SQL syntax builtins (parser rewrites to pg_catalog internally) --

  test("allows EXTRACT (parser rewrites to pg_catalog.extract)", () => {
    expect(() => validateSql("SELECT EXTRACT(EPOCH FROM NOW())")).not.toThrow()
  })

  test("allows POSITION", () => {
    expect(() => validateSql("SELECT POSITION('x' IN source) FROM fwss_data_set_created")).not.toThrow()
  })

  test("allows OVERLAY", () => {
    expect(() => validateSql("SELECT OVERLAY(source PLACING 'x' FROM 1 FOR 1) FROM fwss_data_set_created")).not.toThrow()
  })

  test("allows the remaining SQL-syntax forms", () => {
    expect(() => validateSql("SELECT SUBSTRING(source FROM 2 FOR 3) FROM fwss_data_set_created")).not.toThrow()
    expect(() => validateSql("SELECT TRIM(BOTH 'x' FROM source), TRIM(LEADING FROM source), TRIM(TRAILING FROM source) FROM fwss_data_set_created")).not.toThrow()
    expect(() => validateSql("SELECT NORMALIZE(source), source IS NORMALIZED FROM fwss_data_set_created")).not.toThrow()
    expect(() => validateSql("SELECT TO_TIMESTAMP(timestamp) AT TIME ZONE 'UTC' FROM fp_deposit")).not.toThrow()
    expect(() => validateSql("SELECT (TO_TIMESTAMP(1), TO_TIMESTAMP(2)) OVERLAPS (TO_TIMESTAMP(1), TO_TIMESTAMP(3))")).not.toThrow()
  })

  test("blocks SYSTEM_USER", () => {
    expect(() => validateSql("SELECT SYSTEM_USER")).toThrow(/SYSTEM_USER is not allowed/)
  })

  test("blocks COLLATION FOR", () => {
    expect(() => validateSql("SELECT COLLATION FOR (source) FROM fwss_data_set_created")).toThrow(/PG_COLLATION_FOR is not allowed/)
  })

  // -- Cast and column types --

  test("allows analytical cast types", () => {
    expect(() => validateSql(
      "SELECT amount::numeric, amount::numeric(40, 0), rail_id::bigint, rail_id::int, rail_id::smallint, amount::float8, amount::double precision, amount::real, " +
      "token::text, token::varchar(42), token::char(1), (amount > 0)::boolean, (amount > 0)::bool, " +
      "TO_TIMESTAMP(timestamp)::date, TO_TIMESTAMP(timestamp)::timestamp, TO_TIMESTAMP(timestamp)::timestamptz, TO_TIMESTAMP(timestamp)::time, " +
      "INTERVAL '1 day', DATE '2026-01-01', '{}'::jsonb, '{}'::json, decode('00', 'hex')::bytea, ARRAY[rail_id]::int8[], CAST(amount AS numeric) " +
      "FROM fp_deposit",
    )).not.toThrow()
  })

  test.each(["regclass", "regrole", "regproc", "regprocedure", "regnamespace", "regtype", "regoper", "regcollation", "regconfig", "oid"])(
    "blocks casts to %s",
    (type) => {
      expect(() => validateSql(`SELECT 'pg_roles'::${type}`)).toThrow(new RegExp(`Type ${type} is not allowed`))
    },
  )

  test("blocks catalog enumeration through regclass", () => {
    expect(() => validateSql("SELECT 'pg_roles'::regclass::text")).toThrow(/Type regclass is not allowed/)
    expect(() => validateSql("SELECT CAST('pg_roles' AS regclass)")).toThrow(/Type regclass is not allowed/)
  })

  test("blocks qualified and quoted type names outside pg_catalog's allowed types", () => {
    expect(() => validateSql("SELECT 'x'::pg_catalog.regclass")).toThrow(/Type pg_catalog.regclass is not allowed/)
    expect(() => validateSql("SELECT 'x'::public.text")).toThrow(/Type public.text is not allowed/)
    expect(() => validateSql(`SELECT 'x'::"Text"`)).toThrow(/Type Text is not allowed/)
  })

  // -- Dangerous functions --

  test("blocks pg_read_file", () => {
    expect(() => validateSql("SELECT pg_read_file('/etc/passwd')")).toThrow(/pg_read_file.*not allowed/)
  })

  test("blocks pg_read_binary_file", () => {
    expect(() => validateSql("SELECT pg_read_binary_file('/etc/passwd')")).toThrow(/pg_read_binary_file.*not allowed/)
  })

  test("blocks pg_ls_dir", () => {
    expect(() => validateSql("SELECT pg_ls_dir('/tmp')")).toThrow(/pg_ls_dir.*not allowed/)
  })

  test("blocks pg_stat_file", () => {
    expect(() => validateSql("SELECT pg_stat_file('/etc/passwd')")).toThrow(/pg_stat_file.*not allowed/)
  })

  test("blocks lo_import", () => {
    expect(() => validateSql("SELECT lo_import('/etc/passwd')")).toThrow(/lo_import.*not allowed/)
  })

  test("blocks pg_terminate_backend", () => {
    expect(() => validateSql("SELECT pg_terminate_backend(123)")).toThrow(/pg_terminate_backend.*not allowed/)
  })

  test("blocks pg_sleep", () => {
    expect(() => validateSql("SELECT pg_sleep(10)")).toThrow(/pg_sleep.*not allowed/)
  })

  test("blocks pg_cancel_backend", () => {
    expect(() => validateSql("SELECT pg_cancel_backend(123)")).toThrow(/pg_cancel_backend.*not allowed/)
  })

  test("blocks dangerous functions in subqueries", () => {
    expect(() => validateSql("SELECT * FROM fp_deposit WHERE amount > (SELECT pg_sleep(10))")).toThrow(/pg_sleep.*not allowed/)
  })

  test("blocks dblink", () => {
    expect(() => validateSql("SELECT * FROM dblink('host=evil', 'SELECT 1')")).toThrow(/dblink.*not allowed/)
  })

  // -- Multi-statement injection --

  test("blocks multi-statement (real parser catches it)", () => {
    expect(() => validateSql("SELECT 1; DROP TABLE x")).toThrow(/Multiple statements/)
  })

  test("blocks double SELECT", () => {
    expect(() => validateSql("SELECT 1; SELECT 2")).toThrow(/Multiple statements/)
  })

  test("allows semicolons inside string literals", () => {
    expect(() => validateSql("SELECT * FROM fwss_data_set_created WHERE source = 'test;value'")).not.toThrow()
  })

  // -- Trailing semicolon (allowed, stripped from returned sql) --

  test("strips a trailing semicolon", () => {
    expect(validateSql("SELECT 1;").sql).toBe("SELECT 1")
  })

  test("strips trailing semicolons with whitespace", () => {
    expect(validateSql("SELECT 1 ;  ").sql).toBe("SELECT 1")
    expect(validateSql("SELECT 1;;").sql).toBe("SELECT 1")
  })

  test("strips trailing semicolon without harming a string literal", () => {
    expect(validateSql("SELECT 'a;b';").sql).toBe("SELECT 'a;b'")
  })

  test("still blocks multi-statement with a trailing semicolon", () => {
    expect(() => validateSql("SELECT 1; SELECT 2;")).toThrow(/Multiple statements/)
  })

  test("blocks semicolons-only query as empty", () => {
    expect(() => validateSql(" ; ; ")).toThrow(/Empty/)
  })

  // -- Empty / malformed --

  test("blocks empty query", () => {
    expect(() => validateSql("")).toThrow(/Empty/)
  })

  test("blocks whitespace-only", () => {
    expect(() => validateSql("   \n  ")).toThrow(/Empty/)
  })

  test("blocks comment-only", () => {
    expect(() => validateSql("-- just a comment")).toThrow(/Empty/)
  })

  test("blocks syntax errors", () => {
    expect(() => validateSql("SELEKT 1")).toThrow(/syntax error/)
  })

  // -- Ponder internal tables (caught by table allow-list) --

  test("blocks _ponder tables", () => {
    expect(() => validateSql("SELECT * FROM _ponder_meta")).toThrow(/not a known FOC event table/)
  })

  test("blocks ponder_ tables", () => {
    expect(() => validateSql("SELECT * FROM ponder_status")).toThrow(/not a known FOC event table/)
  })

  test("blocks _reorg__ tables", () => {
    expect(() => validateSql("SELECT * FROM _reorg__fp_deposit")).toThrow(/not a known FOC event table/)
  })

  test("rejects oversized queries before parsing", () => {
    const oversized = `SELECT * FROM fp_deposit WHERE id IN (${"1,".repeat(MAX_SQL_LENGTH)}1)`
    expect(() => validateSql(oversized)).toThrow(/Query too long/)
  })

  test("rejects oversized raw SQL before trimming", () => {
    const oversized = `${" ".repeat(MAX_SQL_LENGTH)}SELECT 1`
    expect(() => validateSql(oversized)).toThrow(/Query too long/)
  })

  test("returns bounded InputError messages for caller SQL", () => {
    const functionName = "a".repeat(1_000)
    expect(() => validateSql(`SELECT ${functionName}(1)`)).toThrow(InputError)
    try {
      validateSql(`SELECT ${functionName}(1)`)
    } catch (err) {
      expect((err as Error).message.length).toBeLessThanOrEqual(300)
    }
  })

  test("accepts a query at the length limit", () => {
    const padding = "-".repeat(MAX_SQL_LENGTH - "SELECT 1 ".length)
    expect(() => validateSql(`SELECT 1 ${padding}`)).not.toThrow()
  })
})
