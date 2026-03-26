/**
 * MCP client that connects to the remote foc-observer server.
 * Used by both the CLI (for direct tool calls) and the serve command
 * (for proxying stdio MCP to remote HTTP MCP).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

let configuredMcpUrl: string | undefined

/** Set the MCP URL for all subsequent calls. Called once at CLI startup. */
export function configureMcpUrl(apiUrl: string): void {
  configuredMcpUrl = `${apiUrl.replace(/\/$/, "")}/mcp`
}

function getDefaultMcpUrl(): string | undefined {
  if (configuredMcpUrl) return configuredMcpUrl
  return process.env.FOC_API_URL
    ? `${process.env.FOC_API_URL.replace(/\/$/, "")}/mcp`
    : undefined
}

export async function createMcpClient(mcpUrl?: string): Promise<Client> {
  const url = mcpUrl ?? getDefaultMcpUrl()
  if (!url) throw new Error("FOC_API_URL environment variable is required")

  const transport = new StreamableHTTPClientTransport(new URL(url))
  const client = new Client({ name: "foc-observer-cli", version: "0.0.1" })
  await client.connect(transport)
  return client
}

/** Call a tool and close the client connection. For one-shot CLI commands. */
export async function callToolAndClose(
  name: string,
  args: Record<string, unknown> = {},
  mcpUrl?: string,
): Promise<unknown> {
  const client = await createMcpClient(mcpUrl)
  try {
    return await callTool(client, name, args)
  } finally {
    await client.close()
  }
}

export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as Array<{ type: string; text?: string }> | undefined
  const firstText = content?.find((c) => c.type === "text")?.text
  if (result.isError) {
    throw new Error(firstText ?? "Unknown error")
  }
  return JSON.parse(firstText ?? "{}")
}
