import { execFile as execFileCallback } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import pg from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { getNetworkConfig } from "../src/networks.js"
import { PonderClient, PONDER_OWNER_ROLE, QUERY_ROLE } from "../src/ponder-client.js"
import { assertDisposable } from "./disposable-postgres.js"

const execFile = promisify(execFileCallback)
const ADMIN_URL = process.env.ROLE_CHECK_DATABASE_URL
const DATABASE = "ponder"
const OLD_OWNER_PASSWORD = "bootstrap-owner-old"
const OWNER_PASSWORD = "bootstrap-owner"
const QUERY_PASSWORD = "bootstrap-query"
const bootstrapPath = fileURLToPath(new URL("../../postgres/bootstrap.sql", import.meta.url))
const provisionPath = fileURLToPath(new URL("../../postgres/provision.sh", import.meta.url))

function databaseUrl(user: string, password: string): string {
  const url = new URL(ADMIN_URL ?? "")
  url.username = user
  url.password = password
  url.pathname = `/${DATABASE}`
  return url.toString()
}

async function provision(ownerPassword: string, previousOwnerPassword: string, queryPassword: string): Promise<void> {
  const url = new URL(ADMIN_URL ?? "")
  const env = {
    ...process.env,
    FOC_DATABASE_OWNER_PASSWORD: ownerPassword,
    FOC_DATABASE_OWNER_PREVIOUS_PASSWORD: previousOwnerPassword,
    FOC_QUERY_DATABASE_PASSWORD: queryPassword,
    FOC_BOOTSTRAP_SQL: bootstrapPath,
    ...(url.port ? { PGPORT: url.port } : {}),
  }
  await execFile("sh", [provisionPath, url.searchParams.get("host") ?? url.hostname], { env })
}

async function hasSelect(url: string, relation: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query("SELECT has_table_privilege($1, 'SELECT') AS allowed", [relation])
    return rows[0].allowed
  } finally {
    await client.end()
  }
}

async function hasColumnSelect(url: string, relation: string, column: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query("SELECT has_column_privilege($1, $2, 'SELECT') AS allowed", [relation, column])
    return rows[0].allowed
  } finally {
    await client.end()
  }
}

describe.skipIf(!ADMIN_URL)("bootstrap public-view publication", () => {
  let admin: pg.Client
  let ownerUrl: string
  let queryUrl: string
  const cleanup: string[] = []

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: ADMIN_URL })
    await admin.connect()
    await assertDisposable(admin)
    ownerUrl = databaseUrl(PONDER_OWNER_ROLE, OLD_OWNER_PASSWORD)
    queryUrl = databaseUrl(QUERY_ROLE, QUERY_PASSWORD)
    await admin.query(`CREATE ROLE ${PONDER_OWNER_ROLE} LOGIN SUPERUSER PASSWORD '${OLD_OWNER_PASSWORD}'`)
    cleanup.push(`DROP ROLE ${PONDER_OWNER_ROLE}`)
    cleanup.push(`DROP ROLE IF EXISTS ${QUERY_ROLE}`)
    await admin.query(`CREATE DATABASE ${DATABASE} OWNER ${PONDER_OWNER_ROLE}`)
    cleanup.push(`DROP DATABASE ${DATABASE}`)

    const owner = new pg.Client({ connectionString: ownerUrl })
    await owner.connect()
    try {
      await owner.query(`
        CREATE SCHEMA data_v1;
        CREATE TABLE data_v1.fp_deposit (id text, amount numeric);
        CREATE TABLE data_v1.unrelated (id text, amount numeric);
        CREATE TABLE public.ponder_bookkeeping (id text);
        CREATE VIEW public.fp_deposit AS SELECT * FROM data_v1.fp_deposit;`)
    } finally {
      await owner.end()
    }

    await provision(OLD_OWNER_PASSWORD, "", QUERY_PASSWORD)
  })

  afterAll(async () => {
    if (!admin) return
    try {
      for (const sql of cleanup.reverse()) await admin.query(sql)
    } finally {
      await admin.end()
    }
  })

  test("grants only Ponder's direct projection of its matching data table", async () => {
    expect(await hasSelect(queryUrl, "public.fp_deposit")).toBe(true)

    const owner = new pg.Client({ connectionString: ownerUrl })
    await owner.connect()
    try {
      await owner.query("CREATE OR REPLACE VIEW public.fp_deposit AS SELECT id || '' AS id, amount FROM data_v1.fp_deposit")
      expect(await hasSelect(queryUrl, "public.fp_deposit")).toBe(false)

      await owner.query("CREATE OR REPLACE VIEW public.fp_deposit AS SELECT * FROM data_v1.fp_deposit")
      expect(await hasSelect(queryUrl, "public.fp_deposit")).toBe(true)

      await owner.query(`
        CREATE OR REPLACE VIEW public.fp_deposit AS
        SELECT fp_deposit.id, fp_deposit.amount
        FROM data_v1.fp_deposit CROSS JOIN data_v1.unrelated`)
      expect(await hasSelect(queryUrl, "public.fp_deposit")).toBe(false)

      await owner.query("CREATE OR REPLACE VIEW public.fp_deposit AS SELECT * FROM data_v1.fp_deposit")
      expect(await hasSelect(queryUrl, "public.fp_deposit")).toBe(true)

      await owner.query("CREATE VIEW public.fp_rail_created AS SELECT * FROM data_v1.unrelated")
      expect(await hasSelect(queryUrl, "public.fp_rail_created")).toBe(false)
      await owner.query(`GRANT SELECT ON public.fp_rail_created TO ${QUERY_ROLE}`)
    } finally {
      await owner.end()
    }

    const client = new PonderClient(getNetworkConfig("calibnet", { queryDatabaseUrl: queryUrl }))
    try {
      expect(await client.checkQueryRole()).toEqual({
        role: QUERY_ROLE,
        problems: ["untrusted public views fp_rail_created"],
      })
    } finally {
      await client.close()
    }
  })

  test("rotates the owner password and reapplies grants on an existing schema", async () => {
    const owner = new pg.Client({ connectionString: ownerUrl })
    await owner.connect()
    try {
      await owner.query(`
        CREATE OR REPLACE VIEW public.fp_rail_created AS SELECT * FROM data_v1.unrelated;
        GRANT SELECT ON public.fp_rail_created TO ${QUERY_ROLE};
        GRANT SELECT (id) ON public.ponder_bookkeeping TO ${QUERY_ROLE}`)
    } finally {
      await owner.end()
    }

    const rotatedQueryPassword = `${QUERY_PASSWORD}-rotated`
    await provision(OWNER_PASSWORD, OLD_OWNER_PASSWORD, rotatedQueryPassword)
    await expect(hasSelect(queryUrl, "public.fp_deposit")).rejects.toMatchObject({ code: "28P01" })
    queryUrl = databaseUrl(QUERY_ROLE, rotatedQueryPassword)
    await expect(hasSelect(databaseUrl(PONDER_OWNER_ROLE, OLD_OWNER_PASSWORD), "public.fp_deposit"))
      .rejects.toMatchObject({ code: "28P01" })
    ownerUrl = databaseUrl(PONDER_OWNER_ROLE, OWNER_PASSWORD)
    expect(await hasSelect(ownerUrl, "public.fp_deposit")).toBe(true)

    await provision(OWNER_PASSWORD, "", rotatedQueryPassword)
    expect(await hasSelect(queryUrl, "public.fp_deposit")).toBe(true)
    expect(await hasColumnSelect(queryUrl, "public.ponder_bookkeeping", "id")).toBe(false)
    expect(await hasSelect(queryUrl, "public.fp_rail_created")).toBe(false)

    const client = new PonderClient(getNetworkConfig("calibnet", { queryDatabaseUrl: queryUrl }))
    try {
      expect(await client.checkQueryRole()).toEqual({ role: QUERY_ROLE, problems: [] })
    } finally {
      await client.close()
    }
  })
})
