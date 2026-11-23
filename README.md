# foc-observer

Observability tools for [FOC (Filecoin Onchain Cloud)](https://filecoin.cloud/).

Provides AI agents and humans with access to:
- **Indexed event history** from all FOC contracts (SQL)
- **Live contract state** via Lotus RPC (providers, datasets, payment rails, pricing)
- **DealBot quality metrics** (deal success, IPFS retrieval, provider health)
- **Proving health** computed from indexed PDPVerifier events (fault rates, weekly trends), cross-checked against the PDP Explorer subgraph

This repository doesn't publish an endpoint: run your own, or ask for an official one that's actively indexing. Read [Security model](#security-model) before exposing yours.

## Quick Start

### Remote MCP (zero install, recommended)

MCP clients with Streamable HTTP support connect directly:

```
https://your-server.example.com/mcp
```

**Claude Code** (streamable HTTP):
```bash
# Project-local (default)
claude mcp add --transport http foc-observer https://your-server.example.com/mcp

# Shared with all projects
claude mcp add --transport http --scope user foc-observer https://your-server.example.com/mcp
```

**Claude.ai**: Add as a connector in Settings > Connectors with the `/mcp` URL.

### Stdio MCP (via npm package)

For MCP clients that only support stdio transport:

```bash
npx @filoz/foc-observer serve --api-url https://your-server.example.com
```

**Claude Code** (stdio):
```bash
claude mcp add --transport stdio foc-observer -- npx @filoz/foc-observer serve --api-url https://your-server.example.com
```

**Claude Desktop / Cursor / other MCP hosts**, add to your MCP config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "foc-observer": {
      "command": "npx",
      "args": ["@filoz/foc-observer", "serve", "--api-url", "https://your-server.example.com"]
    }
  }
}
```

### Scope (Claude Code)

- `--scope local` (default): available only to you in the current project
- `--scope project`: shared with everyone via `.mcp.json` (checked into repo)
- `--scope user`: available to you across all projects

### Other MCP clients

Works with any [MCP-compatible client](https://modelcontextprotocol.io/clients): use the HTTP endpoint where Streamable HTTP is supported, and the stdio proxy elsewhere. The [client package README](client/README.md) has a compatibility table.

### REST API

The same data is available over REST, with CORS enabled:

```bash
# Network status
curl https://your-server.example.com/status

# SQL query against indexed events
curl -X POST https://your-server.example.com/sql \
  -H "Content-Type: application/json" \
  -d '{"network":"mainnet","sql":"SELECT provider_id, COUNT(*) as datasets FROM fwss_data_set_created GROUP BY provider_id"}'

# Live contract state
curl https://your-server.example.com/providers/mainnet
curl https://your-server.example.com/dataset/mainnet/100
curl https://your-server.example.com/rail/mainnet/100

# Proving health (from indexed PDPVerifier events)
curl https://your-server.example.com/proving/providers/mainnet

# DealBot quality metrics
curl https://your-server.example.com/metrics/providers/mainnet?hours=72
```

## MCP Tools

22 tools across 6 data sources:

| Category | Tools | Source |
|----------|-------|--------|
| Knowledge | `get_system_context` | Embedded protocol docs |
| Events | `query_sql`, `list_tables`, `describe_table`, `get_status` | Ponder-indexed Postgres |
| Contract State | `get_providers`, `get_provider`, `get_dataset`, `get_dataset_proving`, `get_rail`, `get_pricing`, `get_account`, `get_auction` | Lotus RPC (eth_call) |
| Quality Metrics | `get_dealbot_stats`, `get_dealbot_providers`, `get_dealbot_provider_detail`, `get_dealbot_daily`, `get_dealbot_failures` | BetterStack / DealBot API |
| Proving Health | `get_proving_health`, `get_proving_dataset` | Indexed PDPVerifier events |
| Proving cross-check | `get_proving_health_goldsky`, `get_proving_dataset_goldsky` | PDP Explorer subgraph (Goldsky) |

Analytical tools require `i_have_read_the_system_context: true`. Call `get_system_context` first with `{}` to receive the complete protocol and data-interpretation guide. Use `list_tables` and `describe_table` for the database schema and field units.

## Security model

A deployment serves an unauthenticated public API: anyone who can reach it can run read-only SQL over the indexed tables (`POST /sql`, `query_sql`) and call every route and tool, from any origin.

**Limits.** Up to 50,000 SQL characters, 30 seconds per statement, 10,000 result rows and 16 MiB of compact result JSON. PostgreSQL checks each SELECT row against 4 MiB of record text before transfer. Each network has a 12-connection pool. Select fewer or smaller columns for a row-size error; paginate for a result-size error.

**Layers.**

1. **SQL validator** (`server/src/sql-validator.ts`). Parses each query with the Postgres parser and accepts only allow-listed statements, syntax, functions, types and tables. The server's own queries pass through it too, with caller values bound as parameters.
2. **Database role** `foc_observer_query`. `SELECT` on the published views in `public`, granted by name from `postgres/bootstrap.sql`, plus the catalog metadata every Postgres role can read. It can't write, create objects, read Ponder's `data_v*` or `ponder_sync` schemas, or use file and program functions. The server checks the role at startup and exits if it can do more.

### Deployment requirements

- **Query as `foc_observer_query`.** Compose sets this up: passwordless database URLs with `PGPASSWORD` set separately for the server and indexers, a `postgres-query-role` service that installs the view allow-list before Ponder starts, and an event trigger that grants `SELECT` as Ponder publishes each view.
- **Distinct passwords.** Generate `FOC_DATABASE_OWNER_PASSWORD` and `FOC_QUERY_DATABASE_PASSWORD` separately, for example with `openssl rand -hex 32`.
- **Existing volumes** need the one-time [credential migration](REINDEX.md#credential-migration), which rotates the owner password and keeps the live indexers; it doesn't need a reindex.
- **Private Postgres.** Compose doesn't publish database ports.
- **An isolated host,** on a network segment without wallets, private keys, storage provider infrastructure (Curio, YugabyteDB, a Lotus node with a wallet) or credentials for other systems.
- **A reverse proxy as the only way in,** terminating TLS and rate-limiting; the server does neither. Compose binds the server to `127.0.0.1` unless `FOC_SERVER_BIND` says otherwise. For a remote proxy, set `FOC_SERVER_BIND` to an interface address and restrict the port, by firewall or port forward, to the proxy's address. For a proxy container on the Compose network, drop the `ports` mapping.
- **Restricted Lotus access.** Remote RPC needs nothing extra. For loopback-only Lotus, enable the `lotus` profile with `LOTUS_PROXY_BIND` set to the Docker bridge gateway, firewall ports 11234 and 11235, and use a read-only Lotus gateway.

**Logs.** JSON request logs go to stdout; Compose rotates them at 50 MB, keeping three files. Successful SQL requests log the first 2,000 characters of the query, so restrict log access. Other entries carry bounded metadata, without tool arguments, backend diagnostics, connection URLs or response bodies. Callers get a fixed message for unknown backend errors.

### Checking a deployment

The server logs its role check at startup, naming the role Postgres reports rather than the configured user:

```bash
docker compose logs foc-observer | grep 'query role'
# mainnet: query role "foc_observer_query" verified, rpc host ...
```

For an older build that doesn't log it, ask Postgres which logins the server's sessions use, making a request first because the server closes idle connections after a few seconds:

```bash
ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$(docker compose ps -q foc-observer)")
curl -s http://127.0.0.1:17824/status > /dev/null    # your FOC_SERVER_BIND address and FOC_SERVER_PORT
docker compose exec postgres-mainnet psql -U ponder -d ponder -c \
  "SELECT usename, count(*) FROM pg_stat_activity WHERE host(client_addr) = '${ip%% *}' GROUP BY usename"
# every row should be foc_observer_query; no rows proves nothing, so rerun the last two commands
# repeat against postgres-calibnet
```

If a deployment has ever queried as `ponder` or another owner or superuser, treat the database host and anything it can reach as compromised: superuser SQL can run commands on the host. Rotate the credentials it can reach, and look for unexpected roles, functions, large objects and files.

Report suspected vulnerabilities privately as the [FilOzone security policy](https://github.com/FilOzone/.github/blob/main/SECURITY.md) describes, not in a public issue.

## Self-Hosting

### Prerequisites

- Docker and Docker Compose
- Lotus nodes or a public RPC such as Glif; deep history needs an archival node

### Setup

```bash
# Clone
git clone https://github.com/FilOzone/foc-observer.git
cd foc-observer

# Create Docker volumes for Ponder data
docker volume create ponder_pgdata-calibnet
docker volume create ponder_pgdata-mainnet

# Configure
cp .env.example .env
# Fill in both RPC endpoints, the public URL and two distinct database passwords.

# Start
docker compose up -d
```

`indexer/ponder.config.ts` is baked into the indexer image, so rebuild after changing it or the indexer's dependencies:

```bash
docker compose up -d --build ponder-calibnet ponder-mainnet
```

### Configuration

All configuration is via `.env`; `.env.example` is the template.

| Variable | Required | Description |
|----------|----------|-------------|
| `FOC_API_URL` | Yes | Public URL of your deployment |
| `FOC_SERVER_PORT` | Yes | HTTP server port |
| `FOC_SERVER_BIND` | No | Address Compose publishes the server on (default `127.0.0.1`) |
| `FOC_DATABASE_OWNER_PASSWORD` | Yes | Owner login for the indexer and provisioning |
| `FOC_QUERY_DATABASE_PASSWORD` | Yes | Separate password for the read-only server login |
| `FOC_DATABASE_OWNER_PREVIOUS_PASSWORD` | Rotation only | Current owner password while the provisioner rotates populated volumes to `FOC_DATABASE_OWNER_PASSWORD`; unset afterwards |
| `CALIBNET_RPC_URL` | Yes | Calibnet Lotus RPC endpoint |
| `MAINNET_RPC_URL` | Yes | Mainnet Lotus RPC endpoint |
| `LOTUS_PROXY_BIND` | Local proxy only | Docker bridge gateway accessible as `host.docker.internal` |
| `LOTUS_CALIBNET_PORT` | No | Local Lotus port for the socat proxy (default `2235`) |
| `LOTUS_MAINNET_PORT` | No | Local Lotus port for the socat proxy (default `2234`) |
| `BETTERSTACK_CH_USER` | No | BetterStack ClickHouse username (enables DealBot metrics) |
| `BETTERSTACK_CH_PASSWORD` | No | BetterStack ClickHouse password |
| `CALIBNET_DATA_SCHEMA` | No | Active Ponder data schema (default `data_v1`); bump on reindex |
| `MAINNET_DATA_SCHEMA` | No | Active Ponder data schema (default `data_v1`); bump on reindex |

Outside Compose, set `FOC_CALIBNET_QUERY_DATABASE_URL` and `FOC_MAINNET_QUERY_DATABASE_URL` yourself, each as `foc_observer_query`. Neither has a default.

**Remote RPC (e.g. Glif):** set `CALIBNET_RPC_URL` and `MAINNET_RPC_URL`, and start without `lotus-proxy`:

```bash
docker compose up -d postgres-calibnet postgres-mainnet ponder-calibnet ponder-mainnet foc-observer
```

**Local Lotus nodes:** `lotus-proxy`, the only container with host networking, forwards two host ports into the Docker bridge network:

```bash
docker compose --profile lotus up -d
```

### Architecture

```
Internet
  --> reverse proxy (TLS, rate limiting; yours to provide)
    --> foc-observer (server, port FOC_SERVER_PORT)

Docker bridge network:
  foc-observer     --> postgres-calibnet, postgres-mainnet  (as foc_observer_query)
                   --> lotus-proxy                          (RPC, via the bridge gateway)
  ponder-calibnet  --> postgres-calibnet                    (as ponder, the owner)
  ponder-mainnet   --> postgres-mainnet                     (as ponder, the owner)

Host network (lotus-proxy only):
  socat :11234 --> Lotus mainnet gateway
  socat :11235 --> Lotus calibnet gateway
```

The server and indexer containers run as the unprivileged `node` user. The server also calls the Goldsky subgraph, DealBot and BetterStack over HTTPS.

### Re-indexing

Follow the [single-network reindex runbook](REINDEX.md) and its [worked Compose override](compose.reindex.example.yaml). It builds alongside the live schema, checks both at a common finalized block, then promotes the tested image on that network only. The runbook covers API verification and switching back to the retained schema and code.

### Client (`@filoz/foc-observer`)

```bash
cd client
npm install
npm run build
npm test
```

### Server

```bash
cd server
npm install
npm run build
npm test
```

### Indexer

The indexer runs on [filecoin-ponder](https://github.com/FilOzone/filecoin-ponder), a Ponder fork with Filecoin support, installed from npm under the name `ponder`. `PONDER_NETWORK` selects `mainnet` (the default) or `calibnet`, and `PONDER_STRICT_ENV=true`, as Compose sets it, makes `PONDER_NETWORK`, `DATABASE_URL` and `RPC_URL` mandatory.

Useful commands:

```bash
cd indexer
npm run dev:mainnet
npm run dev:calibnet
npm run codegen:mainnet
npm run codegen:calibnet
npm test
npm run typecheck
```

To regenerate contract ABIs:

```bash
cd indexer
./scripts/generate-abis.sh          # Uses the default ref pinned in the script
./scripts/generate-abis.sh main     # Or specify a ref
```

The FWSS ABI is a union of the published contract ABI, events from FWSS's internal libraries (which forge leaves out of the contract ABI), and legacy events older deployments emit, so one ABI serves every deployed version. See `indexer/abis/fwss-extra-events.json`.

## What is FOC?

FOC (Filecoin Onchain Cloud) is a decentralized storage service built on Filecoin. Clients pay storage providers to store data, with payments and proofs of data possession managed entirely on-chain via smart contracts:

- [**FilecoinPay**](https://github.com/FilOzone/filecoin-pay): generic payment rail infrastructure (streaming and one-time payments)
- [**PDPVerifier**](https://github.com/FilOzone/pdp): proof of data possession protocol
- [**FWSS + ServiceProviderRegistry + SessionKeyRegistry**](https://github.com/FilOzone/filecoin-services): warm storage service, provider registration, delegated auth

## License

Apache-2.0 OR MIT
