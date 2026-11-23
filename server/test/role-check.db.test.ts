/**
 * PonderClient.checkQueryRole against a real Postgres. Requires
 * ROLE_CHECK_DATABASE_URL: a superuser connection to a disposable cluster, such
 * as a fresh postgres:18 container. RoleFixture refuses anything else and only
 * ever drops what it created.
 */

import pg from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { getNetworkConfig } from "../src/networks.js"
import { PonderClient, QUERY_ROLE } from "../src/ponder-client.js"

const ADMIN_URL = process.env.ROLE_CHECK_DATABASE_URL
const PASSWORD = "role-check"

// Each role holds one privilege that makes it unsafe to serve caller SQL.
const UNSAFE_ROLES: Array<[role: string, grant: string, problem: string]> = [
  ["zz_table_update", "GRANT UPDATE ON data_v1.fp_deposit TO zz_table_update", "owns or can modify relations in data_v1"],
  ["zz_column_update", "GRANT UPDATE (amount) ON data_v1.fp_deposit TO zz_column_update", "owns or can modify relations in data_v1"],
  ["zz_column_insert", "GRANT INSERT (id) ON data_v1.fp_deposit TO zz_column_insert", "owns or can modify relations in data_v1"],
  ["zz_sequence_usage", "GRANT USAGE ON SEQUENCE data_v1.ids TO zz_sequence_usage", "owns or can modify relations in data_v1"],
  ["zz_temporary", "GRANT TEMPORARY ON DATABASE :db TO zz_temporary", "TEMPORARY on the database"],
  ["zz_schema_usage", "GRANT USAGE ON SCHEMA data_v1 TO zz_schema_usage", "USAGE on schema data_v1"],
  ["zz_member", "GRANT pg_monitor TO zz_member", "member of pg_monitor"],
]

interface ClusterState {
  db: string
  public_create: boolean
  public_temp: boolean
}

/**
 * Throws unless `client` is a superuser on a database with no user relations, in
 * a cluster with no roles besides the connecting user and the pg_* built-ins: a
 * fresh postgres:18 passes, a foc-observer deployment can't.
 */
async function assertDisposable(client: pg.Client): Promise<ClusterState> {
  const { rows } = await client.query(`
    SELECT
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema') AS relations,
      ARRAY(SELECT rolname::text FROM pg_roles
        WHERE rolname NOT LIKE 'pg\\_%' AND rolname <> current_user ORDER BY 1) AS roles,
      current_database()::text AS db,
      has_schema_privilege('public', 'public', 'CREATE') AS public_create,
      has_database_privilege('public', current_database(), 'TEMPORARY') AS public_temp`)
  const state = rows[0]
  if (!state.superuser || state.relations > 0 || state.roles.length > 0) {
    throw new Error(
      `ROLE_CHECK_DATABASE_URL must name a superuser on a disposable cluster; found superuser=${state.superuser}, ` +
        `${state.relations} relations, roles [${state.roles.join(", ")}]`,
    )
  }
  return state
}

/**
 * The query role, the unsafe roles and a minimal Ponder-shaped schema, built in
 * an empty database. Setup refuses unless the connection is a superuser, the
 * database holds no user relations and the cluster has no other login roles.
 * Teardown runs the undo for each step that completed, newest first, so a
 * refused or partial setup leaves everything it didn't create alone.
 */
class RoleFixture {
  private readonly undo: string[] = []

  constructor(private readonly admin: pg.Client) {}

  private async step(sql: string, undoSql: string): Promise<void> {
    await this.admin.query(sql)
    this.undo.push(undoSql)
  }

  async setup(): Promise<void> {
    const state = await assertDisposable(this.admin)
    const db = pg.escapeIdentifier(state.db)

    await this.step("CREATE SCHEMA data_v1", "DROP SCHEMA data_v1 CASCADE")
    await this.step(
      "CREATE TABLE data_v1.fp_deposit (id text, amount numeric); CREATE SEQUENCE data_v1.ids",
      "DROP SEQUENCE data_v1.ids; DROP TABLE data_v1.fp_deposit",
    )
    await this.step("CREATE VIEW public.fp_deposit AS SELECT * FROM data_v1.fp_deposit", "DROP VIEW public.fp_deposit")
    if (state.public_create) {
      await this.step("REVOKE CREATE ON SCHEMA public FROM PUBLIC", "GRANT CREATE ON SCHEMA public TO PUBLIC")
    }
    if (state.public_temp) {
      await this.step(`REVOKE TEMPORARY ON DATABASE ${db} FROM PUBLIC`, `GRANT TEMPORARY ON DATABASE ${db} TO PUBLIC`)
    }

    await this.step(
      `CREATE ROLE ${QUERY_ROLE} LOGIN NOINHERIT PASSWORD '${PASSWORD}'`,
      `DROP OWNED BY ${QUERY_ROLE}; DROP ROLE ${QUERY_ROLE}`,
    )
    await this.admin.query(`GRANT USAGE ON SCHEMA public TO ${QUERY_ROLE}; GRANT SELECT ON public.fp_deposit TO ${QUERY_ROLE}`)
    for (const [role, grant] of UNSAFE_ROLES) {
      await this.step(`CREATE ROLE ${role} LOGIN PASSWORD '${PASSWORD}'`, `DROP OWNED BY ${role}; DROP ROLE ${role}`)
      await this.admin.query(grant.replace(":db", db))
    }
  }

  async teardown(): Promise<void> {
    const failures: string[] = []
    for (const sql of this.undo.splice(0).reverse()) {
      try {
        await this.admin.query(sql)
      } catch (err) {
        failures.push(`${sql}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (failures.length > 0) throw new Error(`RoleFixture teardown failed:\n${failures.join("\n")}`)
  }
}

function urlAs(user: string, password = PASSWORD): string {
  const url = new URL(ADMIN_URL ?? "")
  url.username = user
  url.password = password
  return url.toString()
}

function urlForDatabase(db: string): string {
  const url = new URL(ADMIN_URL ?? "")
  url.pathname = `/${db}`
  return url.toString()
}

async function checkAs(url: string) {
  const client = new PonderClient(getNetworkConfig("calibnet", { queryDatabaseUrl: url }))
  try {
    return await client.checkQueryRole()
  } finally {
    await client.close()
  }
}

describe.skipIf(!ADMIN_URL)("checkQueryRole against Postgres", () => {
  let admin: pg.Client

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: ADMIN_URL })
    await admin.connect()
    // Every test below issues DDL, so a non-disposable cluster stops the suite here.
    await assertDisposable(admin)
  })

  afterAll(async () => {
    await admin?.end()
  })

  describe("RoleFixture refuses databases it didn't prepare", () => {
    test("a database holding a deployment's schema, which teardown leaves intact", async () => {
      await admin.query("CREATE DATABASE zz_role_check_refusal")
      const other = new pg.Client({ connectionString: urlForDatabase("zz_role_check_refusal") })
      await other.connect()
      try {
        await other.query(`
          CREATE SCHEMA data_v1;
          CREATE TABLE data_v1.fp_deposit (id text);
          CREATE VIEW public.fp_deposit AS SELECT * FROM data_v1.fp_deposit;`)
        const fixture = new RoleFixture(other)
        await expect(fixture.setup()).rejects.toThrow(/disposable cluster; found superuser=true, 2 relations/)
        await fixture.teardown()
        const { rows } = await other.query(
          "SELECT to_regclass('data_v1.fp_deposit')::text AS t, to_regclass('public.fp_deposit')::text AS v",
        )
        expect(rows[0]).toEqual({ t: "data_v1.fp_deposit", v: "fp_deposit" })
      } finally {
        await other.end()
        await admin.query("DROP DATABASE zz_role_check_refusal")
      }
    })

    test("a cluster that already has the query role, which teardown leaves in place", async () => {
      await admin.query(`CREATE ROLE ${QUERY_ROLE} LOGIN`)
      try {
        const fixture = new RoleFixture(admin)
        await expect(fixture.setup()).rejects.toThrow(new RegExp(`roles \\[${QUERY_ROLE}\\]`))
        await fixture.teardown()
        const { rows } = await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname = $1", [QUERY_ROLE])
        expect(rows[0].n).toBe(1)
      } finally {
        await admin.query(`DROP ROLE ${QUERY_ROLE}`)
      }
    })
  })

  describe("roles", () => {
    let fixture: RoleFixture

    beforeAll(async () => {
      fixture = new RoleFixture(admin)
      await fixture.setup()
    })

    afterAll(async () => {
      await fixture?.teardown()
    })

    test("the provisioned role passes", async () => {
      expect(await checkAs(urlAs(QUERY_ROLE))).toEqual({ role: QUERY_ROLE, problems: [] })
    })

    test.each(UNSAFE_ROLES)("rejects %s", async (role, _grant, problem) => {
      expect((await checkAs(urlAs(role))).problems).toContain(problem)
    })

    test("rejects a superuser login that switches to the query role", async () => {
      const url = new URL(ADMIN_URL ?? "")
      url.searchParams.set("options", `-c role=${QUERY_ROLE}`)
      const { role, problems } = await checkAs(url.toString())
      expect(role).toBe(QUERY_ROLE)
      expect(problems).toEqual([`logged in as "${decodeURIComponent(url.username)}", not ${QUERY_ROLE}`])
    })
  })
})
