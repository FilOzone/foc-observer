# foc-observer

Observability tools for [FOC (Filecoin Onchain Cloud)](https://filecoin.cloud/).

Provides AI agents and humans with access to:
- **Indexed event history** from all FOC contracts (SQL)
- **Live contract state** via Lotus RPC (providers, datasets, payment rails, pricing)
- **DealBot quality metrics** (deal success, IPFS retrieval, provider health)
- **Proving health** from the PDP Explorer subgraph (fault rates, weekly trends)

Public API endpoint URL isn't shared here, you'll either need to run your own from this repo or ask for an official endpoint that's actively indexing.

## Quick Start

### Remote MCP (zero install, recommended)

Any MCP client that supports Streamable HTTP transport can connect directly, no npm install needed:

```
https://your-server.example.com/mcp
```

20 tools with embedded FOC protocol knowledge.

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

Works with any [MCP-compatible client](https://modelcontextprotocol.io/clients); Cursor, Cline, Gemini CLI, Amazon Q, goose, ChatGPT, JetBrains AI, LM Studio, and many more. Use the HTTP endpoint for clients that support Streamable HTTP, or the stdio proxy via `npx @filoz/foc-observer serve` for the rest. See the [client package README](client/README.md) for a compatibility table.

### REST API

All data is available via a public REST API with CORS enabled:

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

# Proving health (from PDP Explorer subgraph)
curl https://your-server.example.com/proving/providers/mainnet

# DealBot quality metrics
curl https://your-server.example.com/metrics/providers/mainnet?hours=72
```

## MCP Tools

20 tools across 5 data sources:

| Category | Tools | Source |
|----------|-------|--------|
| Knowledge | `get_system_context` | Embedded protocol docs |
| Events | `query_sql`, `list_tables`, `describe_table`, `get_status` | Ponder-indexed Postgres |
| Contract State | `get_providers`, `get_provider`, `get_dataset`, `get_dataset_proving`, `get_rail`, `get_pricing`, `get_account`, `get_auction` | Lotus RPC (eth_call) |
| Quality Metrics | `get_dealbot_stats`, `get_dealbot_providers`, `get_dealbot_provider_detail`, `get_dealbot_daily`, `get_dealbot_failures` | BetterStack / DealBot API |
| Proving Health | `get_proving_health`, `get_proving_dataset` | PDP Explorer subgraph (Goldsky) |

Analytical tools require the agent to call `get_system_context` first and pass `i_have_read_the_system_context: true` to confirm it has loaded the protocol knowledge needed to interpret results correctly.

## Self-Hosting

### Prerequisites

- Docker and Docker Compose
- Filecoin Lotus nodes, or access to a public RPC like Glif, although for deep history an archival node will be required

### Setup

```bash
# Clone
git clone https://github.com/your-org/foc-observer.git
cd foc-observer

# Create Docker volumes for Ponder data
docker volume create ponder_pgdata-calibnet
docker volume create ponder_pgdata-mainnet

# Configure
cp .env.example .env
# Edit .env with your RPC endpoints, public URL, etc.

# Start
docker compose up -d
```

### Configuration

All configuration is via `.env`. Copy `.env.example` for a template.

| Variable | Required | Description |
|----------|----------|-------------|
| `FOC_API_URL` | Yes | Public URL of your deployment |
| `FOC_SERVER_PORT` | Yes | HTTP server port |
| `CALIBNET_RPC_URL` | Yes | Calibnet Lotus RPC endpoint |
| `MAINNET_RPC_URL` | Yes | Mainnet Lotus RPC endpoint |
| `LOTUS_CALIBNET_HOST` | No | Local Lotus host for socat proxy (default 127.0.0.1) |
| `LOTUS_CALIBNET_PORT` | No | Local Lotus port for socat proxy (default 2235) |
| `LOTUS_MAINNET_HOST` | No | Local Lotus host for socat proxy (default 2234) |
| `LOTUS_MAINNET_PORT` | No | Local Lotus port for socat proxy (default 2234) |
| `BETTERSTACK_CH_USER` | No | BetterStack ClickHouse username (enables DealBot metrics) |
| `BETTERSTACK_CH_PASSWORD` | No | BetterStack ClickHouse password |

**Using remote RPC (e.g. Glif):**

Set `CALIBNET_RPC_URL` and `MAINNET_RPC_URL` to the remote endpoints and start without the proxy:

```bash
docker compose up -d postgres-calibnet postgres-mainnet ponder-calibnet ponder-mainnet foc-observer
```

**Using local Lotus nodes:**

The `lotus-proxy` container (the only one with host networking) forwards two specific ports from your host into the Docker bridge network. All other containers are network-isolated.

```bash
docker compose up -d
```

### Architecture

```
Internet
  --> nginx (TLS, rate limiting)
    --> foc-observer container

Docker bridge network:
  foc-observer  --> postgres-calibnet, postgres-mainnet  (indexed events)
                --> ponder-calibnet, ponder-mainnet      (indexers)
                --> lotus-proxy                          (RPC, via bridge gateway)

Host network (lotus-proxy only):
  socat :11234 --> Lotus mainnet gateway
  socat :11235 --> Lotus calibnet gateway
```

Containers run as non-root (`USER node`). Only `lotus-proxy` has host networking, forwarding exactly two ports.

## Development

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

The Ponder indexer uses a [Filecoin-compatible fork](https://github.com/rvagg/filecoin-ponder) of Ponder. The Docker build clones this fork automatically.

To regenerate contract ABIs:

```bash
cd indexer
./scripts/generate-abis.sh          # Uses default ref (v1.2.0)
./scripts/generate-abis.sh main     # Or specify a ref
```

## What is FOC?

FOC (Filecoin Onchain Cloud) is a decentralized storage service built on Filecoin. Clients pay storage providers to store data, with payments and proofs of data possession managed entirely on-chain via smart contracts:

- [**FilecoinPay**](https://github.com/FilOzone/filecoin-pay): generic payment rail infrastructure (streaming and one-time payments)
- [**PDPVerifier**](https://github.com/FilOzone/pdp): proof of data possession protocol
- [**FWSS + ServiceProviderRegistry + SessionKeyRegistry**](https://github.com/FilOzone/filecoin-services): warm storage service, provider registration, delegated auth

## License

Apache-2.0 OR MIT
