# foc-observer server

Private HTTP API server and remote MCP endpoint for FOC observability. Not published to npm, runs in Docker.

## What it does

- **REST API** on port 17824: SQL queries, live contract state, DealBot metrics proxy, proving health proxy
- **Remote MCP endpoint** at `/mcp`: Streamable HTTP transport for Claude.ai and other MCP clients
- **20 MCP tools** with embedded domain knowledge about the FOC protocol

## Data sources

| Source | Connection | What it provides |
|--------|-----------|------------------|
| Postgres (calibnet + mainnet) | Bridge network | 43 indexed event tables from Ponder |
| Lotus RPC (via socat proxy) | Bridge gateway | Live contract state (eth_call) |
| BetterStack ClickHouse | HTTPS | DealBot deal/retrieval Prometheus metrics |
| Goldsky subgraph | HTTPS | PDP proving health (authoritative, includes silent faults) |
| DealBot REST API | HTTPS | Failure error classification |

## Development

```bash
npm install
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
| `src/contract-reader.ts` | Live contract reads via viem (eth_call) |
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
- `FOC_CALIBNET_DATABASE_URL` / `FOC_MAINNET_DATABASE_URL`: Postgres connections
- `FOC_CALIBNET_RPC_URL` / `FOC_MAINNET_RPC_URL`: Lotus RPC endpoints
- `BETTERSTACK_CH_USER` / `BETTERSTACK_CH_PASSWORD`: Optional, enables DealBot metrics
