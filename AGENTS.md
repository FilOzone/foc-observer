# foc-observer agent guide

foc-observer indexes the contract events of FOC (Filecoin Onchain Cloud) into Postgres and serves them, with live contract state and service-quality metrics, to AI agents over MCP and to people over REST. Deployments are public and unauthenticated, and anyone can run SQL against them, so the query path is a security boundary as much as a feature.

Current code, CI and the linked repository documentation are authoritative.

## Where foc-observer sits

- **Indexed contracts.** FilecoinPay, PDPVerifier, FilecoinWarmStorageService (FWSS), ServiceProviderRegistry, SessionKeyRegistry, FilBeam and PoRep Market on Filecoin mainnet and calibnet, plus the Storacha FWSS fork, which is wound down and kept for its history. Sources and ABIs come from [filecoin-services](https://github.com/FilOzone/filecoin-services), which also vendors the [pdp](https://github.com/FilOzone/pdp) and [filecoin-pay](https://github.com/FilOzone/filecoin-pay) ABIs.
- **Indexer.** A Ponder app (`indexer/`) built on [filecoin-ponder](https://github.com/FilOzone/filecoin-ponder), a fork that handles Filecoin null rounds, the FVM's saturated logs bloom and gateway lookback limits. The indexer installs the fork from npm as an alias for `ponder` (`indexer/package.json`), so a fork change reaches it only through a new release and a dependency bump.
- **Other sources.** The server reads live contract state from Lotus RPC (`eth_call` through viem), DealBot metrics from BetterStack ClickHouse and the DealBot REST API, and proving data from the PDP Explorer subgraph on Goldsky, which it uses as a cross-check on its own proving computation.
- **Consumers.** MCP clients connect to `/mcp` directly or through the stdio proxy in the published [`@filoz/foc-observer`](client/) package; dashboards and scripts use REST. Agents that query the data get their protocol knowledge from `shared/system-context.ts`. That file is the context for using the data; this one is for changing the code.

## Orientation

- `server/` is the HTTP server (Hono), built into a Docker image.
  - `main.ts`: startup, including the query-role check.
  - `routes.ts` (REST) and `mcp-handler.ts` (MCP tools, registered with `registerTool`).
  - `sql-validator.ts`: the allow-list every SQL query passes.
  - `ponder-client.ts`: Postgres access. `querySql` runs caller SQL, `queryInternal` runs the server's own SQL, `checkQueryRole` inspects the connected role.
  - `proving-client.ts`: proving health computed from `pdp_*` events.
  - `inputs.ts`: parsers for caller-supplied identifiers.
  - `contract-reader.ts`, `subgraph-client.ts`, `betterstack-client.ts`, `dealbot-client.ts`: the other sources.
  - `tripwires.ts`: warnings attached to `query_sql` results for recurring query mistakes.
  - `logger.ts`: structured JSON logs.
- `client/` is `@filoz/foc-observer` on npm: an MCP stdio proxy and CLI that forwards to a server; domain knowledge stays on the server.
- `shared/` holds `system-context.ts` (MCP startup instructions and complete protocol guide) and `table-metadata.ts` (field notes for schema discovery).
- `indexer/` is the Ponder app. Read `indexer/AGENTS.md` before changing it.
- `postgres/` holds `provision.sh` and `bootstrap.sql`, which the `postgres-query-role` Compose one-shot runs to create the restricted query role and its grants.
- `docker-compose.yml` runs everything: two Postgres instances, two indexers, `lotus-proxy`, the provisioning one-shot and the server.

`npm run prebuild` in `server/` copies `shared/*.ts` and `indexer/src/schema-defs.ts` into `server/src/`. Those copies are gitignored and the server Dockerfile copies from the canonical paths, so edit only the originals.

## Security constraints

Every REST route and MCP tool is public and unauthenticated. Treat every path parameter, query parameter, header, tool argument and SQL string as hostile.

- **Caller input never becomes query text.** The server's SQL takes values as `$n` parameters through `queryInternal(sql, params)`. Parse a caller identifier before use with `inputs.ts` (`parseAddress`, `parseSetId`, `parseWeeks`) or an equally strict check. Anything that has to go into GraphQL text, a ClickHouse query or an upstream URL needs a parser first, because those paths don't bind parameters. The only dynamic SQL text is fixed fragments the server selects by key, such as `PROVING_FILTERS` in `proving-client.ts`.
- **All event-table SQL goes through `validateSql`**, whoever wrote it. The exceptions are `PonderClient`'s fixed catalog queries (`listTables`, `describeTable`, `checkQueryRole`), which are static apart from a bound table name in `describeTable`.
- **The validator is an allow-list**: statement types, syntax node types (`ALLOWED_NODE_TYPES`), functions (`ALLOWED_FUNCTIONS`, plus `SQL_SYNTAX_FUNCTIONS` for standard SQL forms such as `EXTRACT`), cast and column types (`ALLOWED_TYPES`), and tables (the keys of `TABLES` in `schema-defs.ts`, plus CTE names in scope). Extending any of these is a security decision. An addition must not read the system catalogs or other schemas, resolve object names (the `reg*` types, `to_regclass`), execute a string as SQL (`query_to_xml`), touch files, large objects or other sessions, change settings (`set_config`), sleep or take locks. Add a test that rejects the dangerous use and one that accepts the legitimate one.
- **Names resolve the way Postgres resolves them.** An unqualified table, function or type name is looked up in `pg_catalog` before `public`, so any rule that allows a name has to match Postgres's scoping. CTE names are scoped per `SELECT` and registered after their own body, as in a non-recursive `WITH`.
- **The database role is the real boundary.** The server connects only through `FOC_<NETWORK>_QUERY_DATABASE_URL`, which has no default, and `main.ts` exits unless `checkQueryRole` finds a connection that logged in as, and runs as, `foc_observer_query`, with no role memberships, no CREATE or TEMPORARY privilege, no schema access beyond `public`, and no way to own or write to a table, column or sequence in any schema. Startup logs name the verified role and the RPC host, never a connection URL. Don't add a fallback to an owner connection, give the server owner credentials, or run DDL from the server. Grants belong in `postgres/bootstrap.sql`, which the one-shot reapplies.
- **Error text reaches callers.** `sanitizeError` strips Postgres connection strings and `password=` fragments and nothing else. viem errors embed the RPC URL. Keep secrets out of error messages.
- **Bound the work a request can cause.** `MAX_SQL_LENGTH` (50,000) caps parser input, `MAX_ROWS` (10,000) caps results through a cursor, and the role's `statement_timeout` (30 seconds) and each network's 12-connection pool cap database time. The validator has to stay linear in query size: walk each node once, because nested structures that get re-walked grow exponentially.

## Data model

- `indexer/src/schema-defs.ts` defines every table once. `ponder.schema.ts` maps it to Ponder tables, the discovery tools use it for table and column descriptions, and its keys are the validator's table allow-list.
- Event rows carry `id`, `tx_hash`, `block_number` and `timestamp`. Transaction fields (`tx_from`, `tx_value`, `gas_used`, `effective_gas_price`, `tx_to`, `tx_selector`, `status`) live in `tx_meta`, one row per transaction, written by `recordTx`. Join with `JOIN tx_meta USING (tx_hash)`.
- Each indexer writes its tables to a versioned schema (`data_vN`, named by `<NETWORK>_DATA_SCHEMA` in `.env`) and Ponder creates matching views in `public`. The server queries unqualified names and the validator rejects schema-qualified ones, so the server never knows which `data_vN` is live.
- `fwss_*` tables key on `data_set_id` and `pdp_*` tables on `set_id`, which hold the same value. `rail_id` joins the `fp_*` tables, and `fwss_data_set_created.pdp_rail_id` links a dataset to its payment rail.
- Keep `get_system_context` within 64 KiB on the wire and startup instructions within 5 KiB. `server/test/system-context.test.ts` measures both over MCP. Preserve worked queries, identifiers and interpretation traps in the single-call guide. Trim repetition and obsolete history before cutting recipes; use `describe_table` for column details.

## Build and test

Run from the repository root with the current Node.js LTS release, matching CI's `lts/*`:

```sh
(cd server && npm ci && npm run build && npm test)
(cd client && npm ci && npm run build && npm test)
(cd indexer && npm ci && npm test && npm run codegen:calibnet && npm run typecheck)
```

CI runs these three jobs (`.github/workflows/test.yml`) and builds the indexer image on pushes to `master` (`indexer-image.yml`).

- `npm test` in `server/` doesn't run `prebuild`. Run `npm run prebuild` after editing `shared/` or `schema-defs.ts`.
- Offline tests mock `pg` and `fetch`. `npm run test:live` (`LIVE_TEST=1`) needs `FOC_CALIBNET_QUERY_DATABASE_URL` and a reachable Lotus RPC.
- `test/role-check.db.test.ts` runs `checkQueryRole` against real roles when `ROLE_CHECK_DATABASE_URL` names a superuser on a disposable cluster; it creates and drops roles. CI provides one. Locally: `docker run --rm -d -p 127.0.0.1:55432:5432 -e POSTGRES_PASSWORD=x postgres:18`, then `ROLE_CHECK_DATABASE_URL=postgres://postgres:x@127.0.0.1:55432/postgres npm test`. Add a case there for every privilege the check learns to reject.
- `test/proving-client.test.ts` runs the provider and network queries against PostgreSQL when `PROVING_QUERY_DATABASE_URL` is set. Use the same disposable cluster as the role checks; the suite creates and drops its own database.
- A validator change can reject queries agents already rely on. Besides unit tests, replay real queries: in a deployment's `logs/foc-observer.jsonl`, the `type: "sql"` entries without an `error` all passed the validator that was live when they ran.

Iterate with the smallest relevant test, and report the checks you didn't run.

## Deployment

| Component | Code source | Applying a change |
|---|---|---|
| `foc-observer` (server) | Built into the image | `docker compose build foc-observer && docker compose up -d foc-observer` |
| `ponder-*` indexing code (`src/`, `abis/`, `ponder.schema.ts`) | Volume-mounted from the checkout | Picked up on the next restart, whatever its cause |
| `ponder-*` config and Ponder package (`ponder.config.ts`, `package.json`) | Built into the image | `docker compose build --no-cache ponder-<network>`, then `docker compose up -d --force-recreate ponder-<network>` |

- `docker compose up -d foc-observer` reruns the `postgres-query-role` one-shot, which reapplies the grants; `docker compose restart foc-observer` doesn't.
- **The checkout is the indexer deployment.** Ponder hashes its internal `BUILD_ID_VERSION`, the config, the schema and the indexing code. The package version alone doesn't change the build ID, but a release can change `BUILD_ID_VERSION`. On restart the indexer refuses a schema with a different build ID. Keep its image and mounted code matched to the live schema.
- Never set `PONDER_EXPERIMENTAL_DB=platform` in Compose. It disables that build-ID guard, so Ponder resumes a schema under code that didn't build it.

### Re-indexing

Follow the [single-network reindex runbook](REINDEX.md) for preflight, checkpoints, cutover, API verification and rollback. The [example override](compose.reindex.example.yaml) runs the candidate image without the live checkout's bind mounts.

## Logging

`logger.ts` writes JSON lines to stdout, and to `FOC_LOG_PATH` when set (Compose maps it to `logs/foc-observer.jsonl`). Entry types are `mcp` (tool, parameters, duration, result size, error, caller user agent and `X-Real-IP`), `sql` (query text up to 2,000 characters, network, rows, duration, tables, a `slow` flag past 500 ms), `rest` (method, path, status, duration) and `startup`. `rest` entries and fast indexer-head polls go to stdout only, so the file holds the analytically useful record. `logger.ts` lists `jq` recipes for it.

## Change hygiene

Add tests that would fail for a plausible regression. Report suspected vulnerabilities privately as the [FilOzone security policy](https://github.com/FilOzone/.github/blob/main/SECURITY.md) describes, never in a public issue or PR.

### Comments, docs and commit messages

- Write code comments and reference docs year-zero: describe the code as it is, as if it had always been this way. History (the old behaviour, the bug, the fix, the issue) goes in the commit message and PR description. In comments, words like "now", "previously", "used to", "no longer", "instead of" and "fixed" signal change narration; rewrite or delete. A link that explains a constraint that still applies stays.
- A comment earns its place by stating what a maintainer can't read from the code: intent, an invariant, a security or compatibility constraint, a surprising cost. Don't restate the code, the test name or the assertion; prefer one precise sentence.
- Commit messages and PR descriptions explain what changed and why, for a reviewer. Skip summaries of the diff, boilerplate sections and claims you haven't verified.
- Use Conventional Commits, `<type>(<scope>): <description>`, for commit subjects and PR titles. Scopes in use include `server`, `client`, `indexer`, `system-context` and `deps`.

## Reviewing changes

Read the relevant callers, schema definitions and tests before commenting, and verify assumptions against current code.

Priorities, in order:

1. Caller input reaching SQL, GraphQL, ClickHouse or upstream URL text, and any widening of the validator's allow-lists.
2. The query role and anything that handles database credentials.
3. Correctness of indexed data: handler output against `schema-defs.ts`, decoding, and whether the change needs a reindex.
4. Deployment safety: build-ID changes, mounts, and the order of steps a rollout needs.
5. Accuracy of what agents are told: `shared/system-context.ts`, tool descriptions, tripwires.
6. Tests.

Comment only on a concrete, plausible failure the change introduces: the triggering input or state, the wrong result, its consequence. Skip style preferences, speculative hardening, pre-existing problems and refactors without behavioural benefit. One exception: comments that narrate the change or restate the code count as defects here, so report them.

## Maintaining agent context

This file and `indexer/AGENTS.md` are maintained with the code. When a change makes one of them wrong, fix it in the same PR.

Each `AGENTS.md` has a sibling `CLAUDE.md` containing only `@AGENTS.md`, because by default Claude Code skips `AGENTS.md` files whenever a `CLAUDE.md` exists at or above its working directory. Add the pair together; put content in `AGENTS.md`, never in the `CLAUDE.md`.
