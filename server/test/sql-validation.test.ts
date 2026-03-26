import { describe, expect, test } from "vitest"
import { PonderClient } from "../src/ponder-client.js"

describe("SQL validation", () => {
  // Allowed queries
  test("allows SELECT", () => {
    expect(() => PonderClient.validateSql("SELECT 1")).not.toThrow()
  })

  test("allows select (case insensitive)", () => {
    expect(() => PonderClient.validateSql("select count(*) from fp_deposit")).not.toThrow()
  })

  test("allows WITH (CTE)", () => {
    expect(() => PonderClient.validateSql("WITH x AS (SELECT 1) SELECT * FROM x")).not.toThrow()
  })

  test("allows EXPLAIN", () => {
    expect(() => PonderClient.validateSql("EXPLAIN SELECT 1")).not.toThrow()
  })

  test("allows leading whitespace", () => {
    expect(() => PonderClient.validateSql("  \n  SELECT 1")).not.toThrow()
  })

  // Blocked statement types
  test("blocks DROP", () => {
    expect(() => PonderClient.validateSql("DROP TABLE fp_deposit")).toThrow(/Only SELECT/)
  })

  test("blocks INSERT", () => {
    expect(() => PonderClient.validateSql("INSERT INTO fp_deposit VALUES (1)")).toThrow(/Only SELECT/)
  })

  test("blocks UPDATE", () => {
    expect(() => PonderClient.validateSql("UPDATE fp_deposit SET amount = 0")).toThrow(/Only SELECT/)
  })

  test("blocks DELETE", () => {
    expect(() => PonderClient.validateSql("DELETE FROM fp_deposit")).toThrow(/Only SELECT/)
  })

  test("blocks COPY", () => {
    expect(() => PonderClient.validateSql("COPY fp_deposit TO STDOUT")).toThrow(/Only SELECT/)
  })

  test("blocks SET", () => {
    expect(() => PonderClient.validateSql("SET TRANSACTION READ WRITE")).toThrow(/Only SELECT/)
  })

  test("blocks SHOW", () => {
    expect(() => PonderClient.validateSql("SHOW server_version")).toThrow(/Only SELECT/)
  })

  // EXPLAIN ANALYZE blocked
  test("blocks EXPLAIN ANALYZE", () => {
    expect(() => PonderClient.validateSql("EXPLAIN ANALYZE SELECT 1")).toThrow(/EXPLAIN ANALYZE/)
  })

  test("blocks explain analyze (case insensitive)", () => {
    expect(() => PonderClient.validateSql("explain analyze select 1")).toThrow(/EXPLAIN ANALYZE/)
  })

  // System catalog access blocked
  test("blocks pg_shadow", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_shadow")).toThrow(/pg_shadow/)
  })

  test("blocks pg_authid", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_authid")).toThrow(/pg_authid/)
  })

  test("blocks pg_roles", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_roles")).toThrow(/pg_roles/)
  })

  test("blocks pg_stat_activity", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_stat_activity")).toThrow(/pg_stat_activity/)
  })

  test("blocks pg_catalog qualified access", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_catalog.pg_class")).toThrow(/pg_catalog/)
  })

  test("blocks information_schema", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM information_schema.tables")).toThrow(/information_schema/)
  })

  test("blocks pg_settings", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_settings")).toThrow(/pg_settings/)
  })

  test("blocks pg_user", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_user")).toThrow(/pg_user/)
  })

  test("blocks catalog references in subqueries", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM fp_deposit WHERE 1 IN (SELECT 1 FROM pg_shadow)")).toThrow(/pg_shadow/)
  })

  // Dangerous functions blocked
  test("blocks pg_read_file", () => {
    expect(() => PonderClient.validateSql("SELECT pg_read_file('/etc/passwd')")).toThrow(/pg_read_file/)
  })

  test("blocks pg_read_binary_file", () => {
    expect(() => PonderClient.validateSql("SELECT pg_read_binary_file('/etc/passwd')")).toThrow(/pg_read_binary_file/)
  })

  test("blocks pg_ls_dir", () => {
    expect(() => PonderClient.validateSql("SELECT pg_ls_dir('/tmp')")).toThrow(/pg_ls_dir/)
  })

  test("blocks pg_stat_file", () => {
    expect(() => PonderClient.validateSql("SELECT pg_stat_file('/etc/passwd')")).toThrow(/pg_stat_file/)
  })

  test("blocks lo_import", () => {
    expect(() => PonderClient.validateSql("SELECT lo_import('/etc/passwd')")).toThrow(/lo_import/)
  })

  test("blocks pg_terminate_backend", () => {
    expect(() => PonderClient.validateSql("SELECT pg_terminate_backend(123)")).toThrow(/pg_terminate_backend/)
  })

  test("blocks pg_tables", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_tables")).toThrow(/pg_tables/)
  })

  test("blocks pg_database", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_database")).toThrow(/pg_database/)
  })

  // Multi-statement injection
  test("blocks semicolon injection", () => {
    expect(() => PonderClient.validateSql("SELECT 1; DROP TABLE x")).toThrow(/semicolon/)
  })

  test("blocks semicolon in middle", () => {
    expect(() => PonderClient.validateSql("SELECT 1; SELECT 2")).toThrow(/semicolon/)
  })

  test("blocks trailing semicolon", () => {
    expect(() => PonderClient.validateSql("SELECT 1;")).toThrow(/semicolon/)
  })

  // BOM and whitespace handling
  test("strips BOM prefix", () => {
    expect(() => PonderClient.validateSql("\uFEFFSELECT 1")).not.toThrow()
  })

  // PG18 new/sensitive objects
  test("blocks pg_config", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_config")).toThrow(/pg_config/)
  })

  test("blocks pg_locks", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_locks")).toThrow(/pg_locks/)
  })

  test("blocks pg_shmem_allocations", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_shmem_allocations")).toThrow(/pg_shmem_allocations/)
  })

  test("blocks pg_stat_ssl", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_stat_ssl")).toThrow(/pg_stat_ssl/)
  })

  test("blocks pg_largeobject", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM pg_largeobject")).toThrow(/pg_largeobject/)
  })

  test("blocks pg_sleep", () => {
    expect(() => PonderClient.validateSql("SELECT pg_sleep(10)")).toThrow(/pg_sleep/)
  })

  // Allowed Postgres table queries
  test("allows FOC event tables", () => {
    expect(() => PonderClient.validateSql("SELECT * FROM fp_deposit LIMIT 10")).not.toThrow()
    expect(() => PonderClient.validateSql("SELECT * FROM fwss_fault_record")).not.toThrow()
    expect(() => PonderClient.validateSql("SELECT * FROM pdp_possession_proven")).not.toThrow()
  })
})
