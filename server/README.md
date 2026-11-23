# foc-observer server

Private HTTP API server and remote MCP endpoint for FOC observability. Not published to npm, runs in Docker.

## What it does

- **REST API** on port 17824: SQL queries, live contract state, DealBot metrics proxy, proving health proxy
- **Remote MCP endpoint** at `/mcp`: Streamable HTTP transport for Claude.ai and other MCP clients
- **20 MCP tools** with embedded domain knowledge about the FOC protocol

## Data sources

| Source | Connection | What it provides |
|--------|-----------|------------------|
| Postgres (calibnet + mainnet) | Bridge network | all indexed event tables from Ponder |
| Lotus RPC (via socat proxy) | Configured RPC endpoint | Live contract state (eth_call) |
| BetterStack ClickHouse | HTTPS | DealBot deal/retrieval Prometheus metrics |
| Goldsky subgraph | HTTPS | Independent cross-check of PDP proving health |
| DealBot REST API | HTTPS | Failure error classification |

Caller SELECT results are size-checked before transfer from PostgreSQL. `EXPLAIN` is a utility command: the server checks the size of the returned plan after the driver receives it. Both paths use the SQL input and transaction limits. Response limits do not bound PostgreSQL work, so `generate_series` and array, JSON and string aggregation are disabled. Numeric aggregates remain available. Return separate rows and aggregate in the client.

## Development

```bash
npm ci
npm run build    # Copies shared files (system-context, schema-defs, table-metadata) then compiles
npm test         # 115+ offline tests, no services needed
npm start        # Starts on FOC_SERVER_PORT (requires Postgres, Lotus, .env configured)
```

## Key source files

| File | Purpose |
|------|---------|
| `src/mcp-handler.ts` | 20 MCP tools via `registerTool()` |
| `src/routes.ts` | REST API endpoints |
| `src/ponder-client.ts` | Postgres queries with SQL validation and security |
| `src/contract-reader.ts` | Live contract reads via viem (`eth_call` to deployed proxies) |
| `src/betterstack-client.ts` | BetterStack ClickHouse queries for DealBot metrics |
| `src/subgraph-client.ts` | Goldsky PDP Explorer subgraph queries |
| `src/networks.ts` | Network config with env var overrides |
| `src/system-context.ts` | Copied from `shared/`, agent domain knowledge |
| `src/schema-defs.ts` | Copied from `indexer/src/`, table definitions (single source of truth) |
| `src/table-metadata.ts` | Copied from `shared/`, formats schema-defs for agent context |

## Configuration

All via environment variables. See `../.env.example` for the full list. Key variables:

- `FOC_SERVER_PORT`: HTTP port
- `FOC_API_URL`: Public URL (used in agent context for dashboard examples)
- `FOC_CALIBNET_QUERY_DATABASE_URL` / `FOC_MAINNET_QUERY_DATABASE_URL`: Required. Connections for every query, as the restricted `foc_observer_query` role. The server checks the role at startup and exits unless the connection logged in and runs as `foc_observer_query`, only listed public event views are readable, and the role has no memberships, application schema creation privileges or write access
- `FOC_CALIBNET_RPC_URL` / `FOC_MAINNET_RPC_URL`: Lotus RPC endpoints
- `BETTERSTACK_CH_USER` / `BETTERSTACK_CH_PASSWORD`: Optional, enables DealBot metrics
