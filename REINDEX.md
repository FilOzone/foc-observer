# Reindex one network

A reindex builds a fresh Ponder schema (`data_vN`) beside the live one with a shadow writer, compares the two, then promotes the candidate and keeps the old schema for rollback. It runs on one network at a time. Run it when a change alters the indexer build ID: indexing code, `ponder.schema.ts`, `ponder.config.ts`, or a Ponder release that changes `BUILD_ID_VERSION`.

This runbook is written for an operator or agent with shell access to the deployment host. It gives the facts the procedure depends on, the invariants to confirm at each step and the commands that aren't obvious; derive the rest from the deployment's actual Compose model. Stop and report when a check fails, rather than working around it. Run multi-step commands as a script or in a subshell: `set -e` in an interactive shell closes it, along with the variables rollback needs.

## Facts the procedure depends on

- **The live checkout is the indexer deployment.** Both `ponder-*` services bind-mount `indexer/src`, `indexer/abis` and `indexer/ponder.schema.ts` from it, and Ponder refuses to resume a schema whose build ID differs from the running code. Changing the checkout changes what both writers run on their next restart, whatever its cause.
- **A one-network promotion pins images.** The promoted writer runs the candidate image without source mounts. Leave the checkout and other network alone. Before retiring overrides, match the checkout to both running builds, persist `CALIBNET_DATA_SCHEMA` and `MAINNET_DATA_SCHEMA` from their active views, and verify base `docker compose config` resolves both intended schema commands, images and mounts.
- **The live schema is whatever the `public` views reference.** Ponder publishes `public` views over its `--schema` once it reaches realtime, if started with `--views-schema public`. The server queries only `public`. A shadow writer started without `--views-schema` builds its schema without touching `public`.
- **Grants follow a manifest.** The `postgres-query-role` provisioner installs `postgres/public-relations.sql` and `bootstrap.sql` in both databases. An event trigger grants `SELECT` on each listed view as Ponder creates it. The server refuses to start if the role can read a view outside its own table list (`TABLES` in its `schema-defs.ts`), or a `public` view that isn't a direct projection of a `data_vN` table. Treat the server image and the provisioner's manifest as one unit, from one commit, promoted and rolled back together.
- **One provisioner and one server serve both networks.** A candidate's manifest and server must keep working for the network you aren't reindexing.
- **Progress is in checkpoints.** Each schema has `_ponder_checkpoint` with `latest_checkpoint` and `finalized_checkpoint` per chain. These are 75-digit strings whose digits 27 to 42 hold the block number; whole strings compare as positions in the chain.
- **The RPC cache is shared.** A shadow writer replays cached ranges and fetches only what's missing, but a new event topic needs RPC history from its start block. Ponder fetches `startBlock - 1` at startup, so that block must be available from the deployment's RPC and must not be a null round. A Ponder minor-version upgrade migrates the cache to a new schema on its first start (0.18 uses `ponder_rpc_cache_1`), leaving the old one for the old version, so rollback still works.
- **Preconditions.** `public` must hold Ponder views over `data_vN`. A deployment with event tables in `public` needs a schema migration. Check [credentials and grants](#credential-migration) before reindexing.

## Helpers

Run from the live Compose project directory with its `.env` and complete Compose file list, including local overrides.

```bash
files=docker-compose.yml        # the deployment's full COMPOSE_FILE list
net=calibnet new=data_v2        # network and an unused schema
other=mainnet                   # the network left alone
base() { COMPOSE_FILE="$files" docker compose "$@"; }
db() { base exec -T "postgres-$1" psql -X -v ON_ERROR_STOP=1 -U ponder -d ponder "${@:2}"; }
backing() { db "$1" -Atc "SELECT DISTINCT table_schema FROM information_schema.view_table_usage
  WHERE view_schema='public' AND view_name='fp_deposit'"; }
checkpoint() { db "$net" -Atc "SELECT $2 FROM \"$1\"._ponder_checkpoint WHERE chain_name='$net'"; }
height() { [[ $1 =~ ^[0-9]{75}$ ]] && echo "$((10#${1:26:16}))"; }
```

## 1. Preflight

Confirm, and record in the operation record:

- `old=$(backing "$net")` is a `data_vN` schema, and `$new` doesn't exist (`SELECT to_regnamespace('data_v2') IS NULL`).
- The candidate checkout is a separate clone, clean (no modified, staged or untracked files), at a recorded commit.
- The image IDs of the running `ponder-$net` and `foc-observer` containers, the live checkout's revision, the container mounts and the database backup location.
- Disk headroom for a second copy of the network's tables and indexes, cache growth and WAL.
- The candidate's start blocks: `startBlock - 1` is fetchable from this deployment's RPC.

## 2. Build the candidate

Extract the candidate commit with `git archive` into a directory kept through the rollback window, then from that tree:

- run `node postgres/generate-public-relations.mjs --check`
- build the indexer image (`indexer/`) and the server image (`server/Dockerfile`, repository root as context)
- record both as `sha256:` image IDs. Compose receives the IDs, never tags, so a rebuilt tag can't change what gets promoted.

Check that the candidate manifest still lists every view the query role can read on the other network:

```bash
allowed=$(grep "^  ('" "$candidate_root/postgres/public-relations.sql" | cut -d"'" -f2 | sort -u)
readable=$(db "$other" -Atc "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v' AND has_table_privilege('foc_observer_query', c.oid, 'SELECT')" | sort -u)
comm -23 <(echo "$readable") <(echo "$allowed")   # must print nothing
```

## 3. Shadow catch-up

`compose.reindex.example.yaml` adds a `reindex` service that extends `ponder-$net`. Add it with `--profile reindex` and set `REINDEX_NETWORK`, `REINDEX_SCHEMA` and `REINDEX_IMAGE` (candidate indexer ID). In `docker compose config`, check the candidate image, empty mounts and `--schema $new`. The command must unset `DATABASE_VIEWS_SCHEMA` and omit `--views-schema`, or Ponder can switch the public views at catch-up.

Start it, then follow both schemas with `height "$(checkpoint "$old" finalized_checkpoint)"` and the same for `$new`. Don't restart the live writer during catch-up: its mounts would pair the checkout's code with the old schema, and if the checkout has changed, it refuses to start.

## 4. Compare

Once the shadow is indexing in realtime, take the lower of the two finalized heights minus one as `through`.

- **Unchanged tables** have equal row counts through `through`, for example `SELECT count(*) FROM "<schema>".fp_deposit WHERE block_number <= <through>` in both schemas. If the start block moved, compare only the overlap and check the backfill separately.
- **Intentional changes** match what the change claims. Record the queries and results; they get repeated through the API after promotion.
- **Release-specific checks.** For releases that touch FWSS dispatching or storage terms, run these with the tables qualified by `$new` (`"data_v2".fwss_piece_added`), then unqualified through `/sql` after promotion:

| Network | Query | Expected |
|---|---|---|
| Mainnet | `SELECT DISTINCT data_set_id, raw_size FROM fwss_piece_added WHERE data_set_id IN (1906,1907) AND raw_size IN (6174209750,10469177046)` | Both datasets at 6174209750 bytes, neither at 10469177046. |
| Mainnet | `SELECT count(*) FROM fwss_data_set_storage_terms_selected WHERE block_number BETWEEN 6560696 AND 6569926` | 6 |
| Calibnet | `SELECT data_set_id, storage_terms_id FROM fwss_data_set_storage_terms_selected WHERE data_set_id BETWEEN 55250 AND 55252` | Only 55252, terms ID zero. All three were created in block 4256439; the first two preceded the migration. |
| Calibnet | `SELECT count(*) FROM fwss_data_set_storage_terms_selected WHERE block_number BETWEEN 4256439 AND 4269272` | 1554, all zero. Zero is the built-in legacy terms and has no registration row. |

On calibnet, per `tx_hash`, `fwss_erc1967_upgraded`, `fwss_diamond_delegate_call` and `fwss_selector_delegated` hold 2, 1 and 73 rows for the [1.5 transition](https://filecoin-testnet.blockscout.com/tx/0x8cd0fb616ddd74361813f3fa7815ad31a2412b70bd338175225a37e3ce573a4e), and 0, 2 and 62 for the [1.6 migration](https://filecoin-testnet.blockscout.com/tx/0xd87306666a62f0b363e7b1b8c7a651c21916c5106a4e0cb274ffd5317c32cd5e).

## 5. Prepare promotion and rollback

Write both overrides before stopping anything, and verify each with `docker compose config`:

```yaml
# compose.release.<net>.<schema>.yaml
services:
  ponder-calibnet:
    image: sha256:<candidate indexer>
    command: ["npm", "start", "--", "--schema", "data_v2", "--views-schema", "public"]
    build: !reset null
    volumes: !reset []
    pull_policy: never
  foc-observer:
    image: sha256:<candidate server>
    build: !reset null
    pull_policy: never
  postgres-query-role:
    volumes: !override
      - <candidate_root>/postgres/provision.sh:/usr/local/bin/provision:ro
      - <candidate_root>/postgres:/usr/local/share/foc:ro
```

The rollback override pins `ponder-$net` to the old image and `--schema $old`, keeping its original mounts, and `foc-observer` to the old server image. Its provisioner volumes must resolve to the ones active before promotion, so the old server gets the manifest it was built with. Confirm the rollback model's `ponder-$net` command, environment and volumes equal the live ones.

## 6. Cut over

1. Pause anything that recreates Compose services or rewrites deployment settings.
2. Stop `ponder-$net` and record its `latest_checkpoint`. Wait, about five minutes at most, for the shadow's `latest_checkpoint` to reach it. If it doesn't, `base start ponder-$net` and investigate.
3. Remove the shadow. Start `ponder-$net` from the promotion file list with `--no-deps --no-build`.
4. Wait until `backing "$net"` returns `$new`. A view that still references `$old` belongs to a table the candidate removed: inspect it and drop it with `DROP VIEW ... RESTRICT`. A dependency error needs investigating, not `CASCADE`.
5. Run the provisioner from the promotion file list (`run --rm --no-deps postgres-query-role`). Then recreate the server with `up -d --no-deps --no-build --force-recreate foc-observer`, so its startup role check runs against the new grants now rather than at the next unplanned restart.
6. Verify:
   - `/status` reports both networks reachable
   - `/sql` returns the recorded counts for both networks
   - a changed table answers through `/sql`
   - the checkpoint advances
7. Persist the promotion file list as the deployment's `COMPOSE_FILE`, confirm that plain `docker compose config` resolves the same images, mounts and schema, and resume automation.

## 7. Roll back

1. Stop `ponder-$net` and start it from the rollback file list against `$old`.
2. Wait for `backing "$net"` to return `$old`, and drop any candidate-only views with `RESTRICT`.
3. Run the provisioner from the rollback file list, then recreate the server.
4. Run the same verification, then persist the rollback file list.

Rollback changes schemas and images only. It leaves credentials as they are. Keep `$new` until the cause is understood; it holds the evidence.

## Credential migration

Check both databases before cutover. A verified query-role login alone doesn't distinguish blanket public grants from the manifest policy. Migrate if the deployment still uses a default owner password, embeds passwords in database URLs, or lacks the release's allow-list and enabled `foc_observer_grant_public_view_select` trigger. Verify with the release provisioner and server, not an older role-check log.

The end state:
- `ponder` has a new owner password and `foc_observer_query` has its own.
- Every process authenticates through `PGPASSWORD` with a passwordless URL, as the base `docker-compose.yml` does.
- Both databases hold the release's grants.
- The server runs the release image and passes its role check on both networks.

Constraints and pointers:
- **Leave the indexers alone.** Keep their images, commands and bind-mounted checkout unchanged, so build IDs don't change and no reindex is needed. Make the change with a temporary Compose override on the deployment's existing file list:
  - `postgres-query-role` mounts `postgres/provision.sh` at `/usr/local/bin/provision` and `postgres/` at `/usr/local/share/foc` from a clean release checkout. It gets `FOC_DATABASE_OWNER_PASSWORD`, `FOC_DATABASE_OWNER_PREVIOUS_PASSWORD` and `FOC_QUERY_DATABASE_PASSWORD`, and any inherited `PGPASSWORD` is removed (`!reset null`).
  - Each `ponder-*` pins its running container's image ID (`build: !reset null`, `pull_policy: never`) and switches to `PGPASSWORD` with `DATABASE_URL=postgres://ponder@postgres-<network>:5432/ponder`.
  - `foc-observer` runs an image built from the release checkout, with `PGPASSWORD` set to the query password and `postgres://foc_observer_query@postgres-<network>:5432/ponder` for both networks.
  - Diff `docker compose config` with and without the override: only these fields change.
- For a rehearsal, use disposable `postgres:18` databases. Verify rotation on a populated volume and read access to a published view but not its backing table.
- **How the rotation works.** The provisioner tries `FOC_DATABASE_OWNER_PASSWORD` on each database. If that fails, it connects with `FOC_DATABASE_OWNER_PREVIOUS_PASSWORD` and rotates to the new one, so a rerun is safe. Remove the previous password from `.env` once both databases accept the new one.
- **Use targeted `up` commands.** Postgres ignores `POSTGRES_PASSWORD` on an initialized volume, but changing it makes a full `up` recreate the database containers. Use `--no-deps` on `up`.
- **On failure, don't go backwards.** Keep the rotated credentials and restricted grants and diagnose the failing service. Don't run an older provisioner or restore the old password.
- **Keep the override active across restarts.** Persist its Compose file list while the live checkout and release differ. Remove it only after the base model resolves the active schema names, matching writer builds, release server and provisioner. Rebuild and recreate the server from that model.
- **Local Lotus only:** if the live Compose predates the bridge-only proxy, include the release's `lotus-proxy` definition in the override. Set `COMPOSE_PROFILES=lotus` and `LOTUS_PROXY_BIND` to the bridge gateway, recreate the proxy, and verify both listeners bind there. Those settings alone do not change an older wildcard listener.
- **A deployment that ever queried as an owner or superuser** should be treated as compromised (see the README's security model). A fresh host and fresh volumes may be cheaper than migrating.
