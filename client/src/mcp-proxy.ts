/**
 * MCP stdio proxy: exposes the remote foc-observer MCP server
 * over stdio transport for Claude Code / Desktop.
 *
 * Connects to the remote HTTP MCP endpoint, discovers its tools,
 * and re-registers them locally on a stdio server. Tool calls are
 * forwarded to the remote server.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

export async function serveProxy(mcpUrl: string): Promise<void> {
  // Connect to remote MCP server
  const remoteTransport = new StreamableHTTPClientTransport(new URL(mcpUrl))
  const remoteClient = new Client({ name: "foc-observer-proxy", version: "0.0.1" })
  await remoteClient.connect(remoteTransport)

  // Get remote server info for instructions
  const serverInfo = remoteClient.getServerCapabilities()
  const instructions = remoteClient.getInstructions()

  // Discover remote tools
  const { tools } = await remoteClient.listTools()

  // Create local stdio server with same instructions
  const localServer = new McpServer({
    name: "foc-observer",
    version: "0.0.1",
  }, {
    instructions: instructions ?? undefined,
  })

  // Register each remote tool locally, forwarding calls to the remote server
  for (const tool of tools) {
    const inputSchema = tool.inputSchema as { properties?: Record<string, unknown> }
    const hasInput = inputSchema?.properties && Object.keys(inputSchema.properties).length > 0

    if (hasInput) {
      // Build a passthrough Zod schema that accepts any properties
      const shape: Record<string, z.ZodTypeAny> = {}
      for (const key of Object.keys(inputSchema.properties ?? {})) {
        shape[key] = z.any()
      }

      localServer.registerTool(tool.name, {
        description: tool.description,
        inputSchema: shape,
        annotations: tool.annotations,
      }, async (args) => {
        const result = await remoteClient.callTool({ name: tool.name, arguments: args })
        return result as { content: Array<{ type: "text"; text: string }>; isError?: boolean }
      })
    } else {
      localServer.registerTool(tool.name, {
        description: tool.description,
        annotations: tool.annotations,
      }, async () => {
        const result = await remoteClient.callTool({ name: tool.name })
        return result as { content: Array<{ type: "text"; text: string }>; isError?: boolean }
      })
    }
  }

  // Start stdio transport
  const stdioTransport = new StdioServerTransport()
  await localServer.connect(stdioTransport)
}
