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

Analytical tools require the agent to call `get_system_context` first and pass `i_have_read_the_system_context: true`, confirming it has the protocol knowledge to interpret results.

## Security model

A deployment serves an unauthenticated public API. Anyone who can reach it can run read-only SQL over the indexed tables (`POST /sql`, `query_sql`) and call every other route and tool, from any origin. The data is public chain data, so read access is the product; a deployment's job is to make sure it's all a caller gets.

Two layers sit between a caller and the database:

1. **The SQL validator** (`server/src/sql-validator.ts`) parses each query with the Postgres parser and accepts only allow-listed statements, syntax, functions, types and tables. The server's own queries go through it too, with caller values bound as parameters.
2. **The database role.** The server connects as `foc_observer_query`, which can only `SELECT` from the views in `public`. It can't write, create objects, read Ponder's `data_v*` and `ponder_sync` schemas, or use privileged file and program functions.

The role is the real boundary, because it limits the damage when the validator or server has a bug. As `foc_observer_query`, a bug can expose catalog metadata and anything readable in `public` (`postgres/bootstrap.sql` grants `SELECT` on every current and future table there except Ponder's bookkeeping), and tie up database capacity. As `ponder`, the owner and a superuser in the official Postgres image, the same bug gives a caller superuser SQL: reading and writing files on the database host, running commands there through `COPY ... TO PROGRAM`, and reaching anything that host can reach.

### Deployment requirements

- **Query as `foc_observer_query`, never as an owner.** Both `FOC_<NETWORK>_QUERY_DATABASE_URL` connections must use that role. Compose builds them from `FOC_QUERY_DATABASE_PASSWORD`, and its `postgres-query-role` one-shot (`postgres/provision.sh`, `postgres/bootstrap.sql`) creates the role and its grants before the server starts. The server checks at startup, and exits if the connection didn't log in and run as `foc_observer_query`, or the role has attributes beyond `LOGIN`, belongs to another role, can use a schema other than `public`, can create objects or temporary tables, or can own or write to any table, column or sequence. It also exits if the check can't run.
- **Set `FOC_QUERY_DATABASE_PASSWORD`.** The Compose default, `foc-observer`, is public.
- **Keep Postgres private.** Compose doesn't publish Postgres ports, but any process on the Docker host can reach the containers' bridge addresses and log in as `ponder` with the password in `docker-compose.yml`, so don't share the host with untrusted users or workloads.
- **Isolate the host.** Keep foc-observer off machines and network segments that hold wallets, private keys, storage provider infrastructure (Curio, YugabyteDB, a Lotus node with a wallet) or credentials for other systems. If the database layer falls, the attacker's next step is whatever that host can reach.
- **Make a reverse proxy the only way in.** The server doesn't authenticate or rate-limit, and with 30-second queries and a 12-connection pool per network, a few callers can saturate it. Terminate TLS and rate-limit at the proxy. Compose publishes the server on `127.0.0.1` unless `FOC_SERVER_BIND` says otherwise, which suits a proxy on the same host. For a remote proxy, set `FOC_SERVER_BIND` to an interface address and firewall the port, or restrict the router's port forward, to the proxy's address; anyone else who can reach it skips the proxy. For a proxy container on the Compose network, drop the `ports` mapping.
- **Firewall `lotus-proxy`.** It uses host networking and listens on 11234 and 11235 on every interface. Block both from outside the host, and point it at a `lotus-gateway` (a restricted read API) rather than a full node.
- **Keep keys out of RPC URLs.** RPC error messages reach callers and include the URL with only `user:password` redacted, so a key in the path or query string leaks.

The server's log (`logs/foc-observer.jsonl`) records every query and MCP call with its parameters, plus the caller's user agent and `X-Real-IP` when the proxy sets it.

### Checking a deployment

The server logs its role check at startup, naming the role Postgres reports rather than the configured user:

```bash
docker compose logs foc-observer | grep 'query role'
# mainnet: query role "foc_observer_query" verified, rpc host ...
```

For a build without that line, ask Postgres which logins the server's own sessions use. The server closes idle connections after a few seconds, so make a request first:

```bash
ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$(docker compose ps -q foc-observer)")
curl -s http://127.0.0.1:17824/status > /dev/null    # your FOC_SERVER_BIND address and FOC_SERVER_PORT
docker compose exec postgres-mainnet psql -U ponder -d ponder -c \
  "SELECT usename, count(*) FROM pg_stat_activity WHERE host(client_addr) = '${ip%% *}' GROUP BY usename"
# every row should be foc_observer_query; no rows proves nothing, so rerun the last two commands
# repeat against postgres-calibnet
```

If a deployment has ever queried as `ponder` or another owner or superuser, assume the database host, and anything it can reach, may be compromised. Rotate the credentials it can reach, and look for unexpected roles, functions, large objects and files.

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
# Edit .env: RPC endpoints, public URL, and FOC_QUERY_DATABASE_PASSWORD

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
| `FOC_QUERY_DATABASE_PASSWORD` | Yes, if exposed | Password for the `foc_observer_query` role (Compose default `foc-observer`) |
| `CALIBNET_RPC_URL` | Yes | Calibnet Lotus RPC endpoint |
| `MAINNET_RPC_URL` | Yes | Mainnet Lotus RPC endpoint |
| `LOTUS_CALIBNET_HOST` | No | Local Lotus host for the socat proxy (default `127.0.0.1`) |
| `LOTUS_CALIBNET_PORT` | No | Local Lotus port for the socat proxy (default `2235`) |
| `LOTUS_MAINNET_HOST` | No | Local Lotus host for the socat proxy (default `127.0.0.1`) |
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
docker compose up -d
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
