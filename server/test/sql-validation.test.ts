import { beforeAll, describe, expect, test } from "vitest"
import { initParser, validateSql } from "../src/sql-validator.js"

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

  test("allows generate_series", () => {
    expect(() => validateSql("SELECT * FROM generate_series(1, 10)")).not.toThrow()
  })

  test("allows string functions", () => {
    expect(() => validateSql("SELECT lower(source), length(source), concat(source, '-test') FROM fwss_data_set_created")).not.toThrow()
  })

  test("allows JSON functions", () => {
    expect(() => validateSql("SELECT jsonb_array_length(pieces::jsonb) FROM pdp_pieces_added")).not.toThrow()
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

  // -- Empty / malformed --

  test("blocks empty query", () => {
    expect(() => validateSql("")).toThrow(/Empty/)
  })

  test("blocks whitespace-only", () => {
    expect(() => validateSql("   \n  ")).toThrow(/Empty/)
  })

  test("blocks comment-only", () => {
    expect(() => validateSql("-- just a comment")).toThrow()
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
})
