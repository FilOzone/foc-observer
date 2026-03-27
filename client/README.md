# @filoz/foc-observer

MCP stdio server and CLI for querying [FOC (Filecoin Onchain Cloud)](https://filecoin.cloud/) historical and live chain data and dealbot data. Gives AI agents and humans access to indexed event history, live contract state, provider health metrics, and proving data from the FOC smart contract stack on Filecoin.

Public API endpoint URL isn't shared here, you'll either need to run your own or ask for an official endpoint.

Also note that the public endpoint also has a streaming MCP server so this package isn't strictly necessary for AI environments such as Claude Desktop that support streaming connectors. See below.

## Quick Start

### Option 1: Remote MCP (recommended, zero install)

If your MCP client supports Streamable HTTP transport, you don't need this package at all -- connect directly to the server:

```
https://your-server.example.com/mcp
```

**Claude Code:**
```bash
claude mcp add --transport http foc-observer https://your-server.example.com/mcp
```

### Option 2: Stdio MCP (via this package)

For MCP clients that only support stdio transport, this package proxies to the remote server:

```bash
npx @filoz/foc-observer serve --api-url https://your-server.example.com
```

**Claude Code:**
```bash
claude mcp add --transport stdio foc-observer -- npx @filoz/foc-observer serve --api-url https://your-server.example.com
```

**Claude Desktop / Cursor / Cline / Windsurf / other MCP hosts** -- add to your MCP config:
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

### Compatibility

This package works with any [MCP-compatible client](https://modelcontextprotocol.io/clients). The remote HTTP endpoint (`/mcp`) works with clients that support Streamable HTTP transport. The stdio proxy (`serve` command) works with all clients. Tested with:

| Client | Transport | Notes |
|--------|-----------|-------|
| Claude Code | HTTP or stdio | `claude mcp add --transport http` recommended |
| Claude.ai | HTTP | Add as connector in Settings |
| Claude Desktop | stdio | Via `claude_desktop_config.json` |
| Cursor | stdio | Via MCP settings |
| Cline (VS Code) | stdio | Via MCP config |
| Gemini CLI | stdio | Via `settings.json` |
| Amazon Q CLI | stdio | Via MCP config |
| goose | stdio or HTTP | Via `~/.config/goose/config.yaml` |
| ChatGPT | HTTP | Via developer mode MCP |
| JetBrains AI | stdio | Via IDE settings |

Any client not listed should work via either transport -- MCP is an open standard.

## How It Works

This package is a thin MCP proxy. The `serve` command creates a local stdio MCP server that forwards all tool calls to the remote foc-observer HTTP server. No local database, no local indexing—all data comes from the remote endpoint.

```
Claude Code/Desktop
  -> stdio -> foc-observer serve (this package)
    -> HTTP -> foc-observer server (/mcp endpoint)
      -> Postgres (indexed events)
      -> Lotus RPC (live contract state)
      -> BetterStack (DealBot metrics)
      -> Goldsky subgraph (proving health)
```

## Configuration

| Option | Required | Description |
|--------|----------|-------------|
| `--api-url <url>` | Yes* | foc-observer server URL (e.g. `https://your-server.example.com`) |
| `FOC_API_URL` env | Yes* | Same, as environment variable. `--api-url` takes precedence. |
| `FOC_NETWORK` env | No | Default network for CLI commands (`mainnet` or `calibnet`, default: `mainnet`) |

*One of `--api-url` or `FOC_API_URL` must be provided.

## CLI Commands

The same binary provides a human-friendly CLI for direct queries:

```bash
# Check connectivity
foc-observer status

# SQL query against indexed events
foc-observer query -n mainnet "SELECT source, COUNT(*) FROM fwss_data_set_created GROUP BY source"

# List tables and row counts
foc-observer tables -n mainnet

# Describe a table's columns
foc-observer describe fwss_data_set_created

# Provider directory
foc-observer providers -n mainnet
foc-observer provider -n mainnet 1

# Dataset details
foc-observer dataset -n mainnet 100

# Payment rail inspection
foc-observer rail -n mainnet 100

# Current pricing
foc-observer pricing -n mainnet
```

All commands support `--json` for machine-readable output.

## MCP Tools (20 tools)

When connected as an MCP server, agents get access to:

| Category | Tools |
|----------|-------|
| Knowledge | `get_system_context` (mandatory first call) |
| Events (SQL) | `query_sql`, `list_tables`, `describe_table`, `get_status` |
| Contract State | `get_providers`, `get_provider`, `get_dataset`, `get_dataset_proving`, `get_rail`, `get_pricing`, `get_account`, `get_auction` |
| Quality Metrics | `get_dealbot_stats`, `get_dealbot_providers`, `get_dealbot_provider_detail`, `get_dealbot_daily`, `get_dealbot_failures` |
| Proving Health | `get_proving_health`, `get_proving_dataset` |

The `get_system_context` tool returns comprehensive protocol knowledge that agents need to interpret results correctly. Analytical tools require `i_have_read_the_system_context: true` to confirm context is loaded.

## What is FOC?

FOC (Filecoin Onchain Cloud) is a layered decentralized storage services marketplace on Filecoin:

- [**FilecoinPay**](https://github.com/FilOzone/filecoin-pay): generic payment rail infrastructure (streaming and one-time payments)
- [**PDPVerifier**](https://github.com/FilOzone/pdp): proof of data possession protocol (neutral, no business logic)
- [**FWSS**](https://github.com/FilOzone/filecoin-services) (FilecoinWarmStorageService): warm storage service with pricing, fault tracking, settlement validation
- [**ServiceProviderRegistry**](https://github.com/FilOzone/filecoin-services): provider registration and discovery
- [**SessionKeyRegistry**](https://github.com/FilOzone/filecoin-services): delegated auth keys

Contract source: [FilOzone/filecoin-services](https://github.com/FilOzone/filecoin-services)

## Self-Hosting

This package connects to a remote foc-observer server. To run your own server, see the [foc-observer repository](https://github.com/FilOzone/foc-observer).

## License

MIT
