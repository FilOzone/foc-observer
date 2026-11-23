import type pg from "pg"

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
export async function assertDisposable(client: pg.Client): Promise<ClusterState> {
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
