# Reindex one network

Build a new versioned schema in the network's existing Postgres, check it alongside the live schema, then switch the `public` views. The replacement runs from an image containing its config, schema, ABIs and handlers. Promotion uses **that same image**. Neither catch-up nor cutover changes the checkout mounted by the other network.

This procedure is for a deployment where `public` already contains Ponder views over `data_vN`. A database with event **tables** in `public` needs a migration, not this view cutover. Use Bash, Docker Compose with `!reset` support, `curl` and `jq`. Commands run from the live Compose project directory. Keep that project's `.env`, project name and Compose files in use throughout; a second checkout is a build input, not a second Compose project.

## Preflight

Choose the network, an unused schema and a clean checkout of the candidate revision. `files` is the colon-separated list of Compose files the live project normally uses, **including any local override**. The example uses stock Compose and a proxy on loopback; adjust `api` for the deployment.

```bash
set -euo pipefail
export REINDEX_NETWORK=calibnet REINDEX_SCHEMA=data_v2
candidate=../foc-observer-candidate
files=docker-compose.yml
api=http://127.0.0.1:17824
live=ponder-$REINDEX_NETWORK
pg=postgres-$REINDEX_NETWORK
case $REINDEX_NETWORK in calibnet|mainnet) ;; *) exit 1 ;; esac
[[ $REINDEX_SCHEMA =~ ^data_v[0-9]+$ ]]
rev=$(git -C "$candidate" rev-parse --short=12 HEAD)
export REINDEX_IMAGE="foc-observer-indexer:$REINDEX_NETWORK-$REINDEX_SCHEMA-$rev"
base() { COMPOSE_FILE="$files" docker compose "$@"; }
shadow() { COMPOSE_FILE="$files:compose.reindex.example.yaml" docker compose --profile reindex "$@"; }
db() { base exec -T "$pg" psql -X -v ON_ERROR_STOP=1 -U ponder -d ponder "$@"; }
backing() { db -Atc "SELECT DISTINCT table_schema FROM information_schema.view_table_usage WHERE view_schema='public' AND view_name='fp_deposit' AND table_name='fp_deposit'"; }
old=$(backing)
[[ $old =~ ^data_v[0-9]+$ && $old != "$REINDEX_SCHEMA" ]]
[[ $(db -At -v s="$REINDEX_SCHEMA" <<<"SELECT to_regnamespace(:'s') IS NULL") == t ]]
base ps "$live" "$pg" foc-observer
docker inspect --format '{{.Name}} image={{.Image}} mounts={{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}' \
  "$(base ps -q "$live")" "$(base ps -q foc-observer)"
base exec -T "$pg" df -h /var/lib/postgresql
```

Check space for a second set of tables and indexes, cache growth, and WAL. Record the old schema, live checkout revision, bind mounts, indexer and server image IDs, and current Compose file list. Keep those images and mounted sources unchanged through verification. Check the project has a recoverable database backup. Don't reuse a schema or overwrite an image tag from a previous attempt.

For a changed start block, Ponder fetches `START_BLOCK - 1`. Check that epoch is a real block available from this deployment's RPC. If it falls in a null round, pick a nearby start whose parent exists and which still includes the earliest required event (`indexer/src/networks.ts` has a calibnet example).

## Build and catch up

```bash
docker build -t "$REINDEX_IMAGE" "$candidate/indexer"
shadow config --format json | jq -e --arg n "$REINDEX_NETWORK" --arg s "$REINDEX_SCHEMA" --arg i "$REINDEX_IMAGE" '
  .services.reindex as $r | .services["ponder-"+$n] as $live |
  $r.image == $i and $r.environment == $live.environment and
  ($r.volumes // [] | length) == 0 and $r.command == ["npm","start","--","--schema",$s] and
  ($r.environment.DATABASE_VIEWS_SCHEMA // "") == ""'
shadow up -d --no-deps reindex
shadow logs --tail=30 reindex
```

The [example service](compose.reindex.example.yaml) inherits the target's settings from the base file. If your deployment overrides RPC, database, networking or other runtime settings, mirror them on `reindex` before starting it. Inspect resolved config locally; it contains credentials. Run one `reindex` service at a time in this project. It writes only to the fresh schema and shared sync cache; it must not publish views during catch-up.

`ponder_sync.intervals` tracks covered ranges per filter fragment. Log fragments distinguish chain, contract address and event topic: adding an event to an already indexed contract still needs RPC for that topic's uncovered history. Code-only changes can replay cached blocks locally. A cache hit has run at about 35,000 blocks/minute on calibnet; measure progress on this deployment rather than using that as a deadline.

Read Ponder's checkpoints, not the highest event block: quiet epochs can advance the indexer without inserting an event. In this fork's 75-digit checkpoint the block number is digits 27 through 42. The full checkpoint also distinguishes positions within a block.

```bash
checkpoint() { db -At -v s="$1" -v n="$REINDEX_NETWORK" -v col="$2" <<'SQL'
SELECT :"col" FROM :"s"._ponder_checkpoint WHERE chain_name = :'n';
SQL
}
height() { local cp=$1; [[ $cp =~ ^[0-9]{75}$ ]] && printf '%d\n' "$((10#${cp:26:16}))"; }
for s in "$old" "$REINDEX_SCHEMA"; do
  printf '%s latest=%s finalized=%s\n' "$s" "$(height "$(checkpoint "$s" latest_checkpoint)")" "$(height "$(checkpoint "$s" finalized_checkpoint)")"
done
```

Repeat until the replacement is near the live head and its logs show realtime indexing. Compare an **unchanged** table through the same completed, finalized block in both schemas. Repeat for relevant tables and separately check expected differences, such as newly indexed events or corrected decoded values. If the start moved, compare only the overlapping block range and check the backfill separately.

```bash
a=$(height "$(checkpoint "$old" finalized_checkpoint)")
b=$(height "$(checkpoint "$REINDEX_SCHEMA" finalized_checkpoint)")
through=$(( (a < b ? a : b) - 1 )); (( through > 0 ))
from_block=0  # If the start moved, use the later start block.
(( from_block >= 0 && from_block <= through ))
deposits() { db -At -v s="$1" -v lo="$from_block" -v h="$through" <<'SQL'
SELECT count(*) FROM :"s".fp_deposit WHERE block_number BETWEEN :'lo'::bigint AND :'h'::bigint;
SQL
}
expected=$(deposits "$old")
[[ $(deposits "$REINDEX_SCHEMA") == "$expected" ]]
```

## Prepare promotion before stopping the live writer

The stock live indexers bind-mount the same checkout. Keep it in place. Give the selected live service a **durable Compose override** that uses the tested image and removes those mounts. This also leaves the old image and sources available for rollback. Create a new file; don't overwrite an existing release file.

```bash
release="compose.release.$REINDEX_NETWORK.$REINDEX_SCHEMA.yaml"
( set -C; cat > "$release" <<EOF
services:
  $live:
    image: $REINDEX_IMAGE
    build: !reset null
    volumes: !reset []
    pull_policy: never
EOF
)
nextfiles="$files:$release"
next() { COMPOSE_FILE="$nextfiles" docker compose "$@"; }
```

If the server must change with the indexer, build it **now**, under a new tag, from the candidate repository root. Add `foc-observer` under `services` in the same release file, with that tag as `image`, `build: !reset null` and `pull_policy: never`. The server serves **both** networks: it must also work with the other network's schema throughout the rollout and rollback.

```bash
# Only for a coordinated server change:
docker build -f "$candidate/server/Dockerfile" -t "foc-observer-server:$rev" "$candidate"
```

Record the previous deployment settings, then set `CALIBNET_DATA_SCHEMA` or `MAINNET_DATA_SCHEMA` in `.env` to `$REINDEX_SCHEMA`. Keep the other network's setting unchanged. This edits the *next start*, not the running container. Verify the effective command, source and image before stopping anything:

```bash
next config --format json | jq -e --arg svc "$live" --arg i "$REINDEX_IMAGE" --arg s "$REINDEX_SCHEMA" '
  .services[$svc] | .image == $i and (.volumes // [] | length) == 0 and
  .command == ["npm","start","--","--schema",$s,"--views-schema","public"]'
```

## Cut over and verify

Keep the values of `old`, `files`, `release`, `from_block`, `through` and `expected` in the operation record. If a check fails and the shell exits, restore these values and the shell function definitions before rollback; don't repeat preflight against the switched views.

```bash
base stop "$live"
last=$(checkpoint "$old" latest_checkpoint); [[ $last =~ ^[0-9]{75}$ ]]
```

Wait for the replacement to reach or pass that **full, stopped** checkpoint. If it doesn't catch up in five minutes, the gate stops before removing it. Inspect the shadow logs; `base start "$live"` resumes the original container on its existing schema. Restore the old schema setting before any recreate.

```bash
for ((i=0; i<60; i++)); do
  caught=$(checkpoint "$REINDEX_SCHEMA" latest_checkpoint)
  [[ $caught =~ ^[0-9]{75}$ && ( $caught == "$last" || $caught > "$last" ) ]] && break
  sleep 5
done
(( i < 60 ))
shadow rm --stop --force reindex
next up -d --no-deps --no-build "$live"
next logs --tail=30 "$live"
```

Ponder creates the `public` views when the promoted writer reaches realtime. It replaces same-named views in a transaction; the existing `public` schema and its ACL stay in place. If the new schema **removes or renames** a table, its old view can survive. List views still referencing the retired schema, inspect them and drop only the obsolete Ponder views by name with `DROP VIEW ... RESTRICT`. A dependency error needs investigation, not `CASCADE`. This procedure doesn't drop `public` or grant `CREATE` to `PUBLIC`.

```bash
stale() { db -At -v s="$1" <<'SQL'
SELECT DISTINCT view_name FROM information_schema.view_table_usage
WHERE view_schema = 'public' AND table_schema = :'s' ORDER BY view_name;
SQL
}
for ((i=0; i<60; i++)); do
  [[ $(backing) == "$REINDEX_SCHEMA" ]] && break
  sleep 5
done
[[ $(backing) == "$REINDEX_SCHEMA" ]]
retired_views=$(stale "$old")
if [[ -n $retired_views ]]; then printf 'Views still using %s:\n%s\n' "$old" "$retired_views" >&2; exit 1; fi
next run --rm --no-deps postgres-query-role
next up -d --no-deps --no-build foc-observer
api_check() {
  jq -n --arg n "$REINDEX_NETWORK" --arg lo "$from_block" --arg h "$through" \
    '{network:$n,sql:("SELECT count(*)::text AS n FROM fp_deposit WHERE block_number BETWEEN " + $lo + " AND " + $h)}' |
    curl -fsS -H 'Content-Type: application/json' --data-binary @- "$api/sql" |
    jq -e --arg n "$REINDEX_NETWORK" --arg count "$expected" '.network == $n and .rows[0].n == $count'
}
api_check
```

Wait for `backing` to report the target before applying grants. Confirm the checkpoint continues advancing and query a changed table through `/sql` as well: `/status` alone doesn't prove the new indexed data is visible. Persist `COMPOSE_FILE` as the value of `$nextfiles` in the deployment's `.env` or service environment, using the same project name. Verify ordinary `docker compose config` resolves the same image, mounts and schema as `next config`. Until this is persisted, **use `next` for service operations** so a restart or deployment doesn't recreate the old configuration.

## Roll back

Keep the old schema, matching image, mounted checkout and original Compose settings until verification is complete. If promotion fails after the new writer starts:

1. `next stop "$live"`. Restore the previous network schema setting and `COMPOSE_FILE` in the deployment configuration. Confirm `base config` selects the old image, original mounts and `--schema "$old" --views-schema public`. Keep other networks' settings intact.
2. Run `base up -d --no-deps --no-build "$live"`. It resumes the retained schema from its checkpoint and recreates the old views on reaching realtime. Watch `base logs --tail=30 "$live"` and wait for `[[ $(backing) == "$old" ]]`.
3. Run `stale "$REINDEX_SCHEMA"`; remove any candidate-only Ponder views as above. Run `base run --rm --no-deps postgres-query-role` and `base up -d --no-deps --no-build foc-observer` to apply grants and restore the old server image if it changed. Run `api_check` and the old release's affected-table query.

After a successful rollout and the rollback window, retire the **confirmed inactive** data schema and its release artifacts. Keep the live release override and image. The `ponder_sync` schema is shared by both runs, not part of either release's cleanup.
