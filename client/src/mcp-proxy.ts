import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

export async function serveProxy(mcpUrl: string): Promise<void> {
  const remoteTransport = new StreamableHTTPClientTransport(new URL(mcpUrl))
  const remoteClient = new Client({ name: "foc-observer-proxy", version: "0.0.1" })
  await remoteClient.connect(remoteTransport)

  // Forward the remote JSON schemas verbatim, including optional parameters and enums.
  const localServer = new Server({ name: "foc-observer", version: "0.0.1" }, {
    capabilities: { tools: {} },
    instructions: remoteClient.getInstructions(),
  })
  localServer.setRequestHandler(ListToolsRequestSchema, ({ params }) => remoteClient.listTools(params))
  localServer.setRequestHandler(CallToolRequestSchema, ({ params }, { signal }) =>
    remoteClient.callTool(params, undefined, { signal }))
  localServer.onclose = () => { void remoteClient.close() }
  const stdioTransport = new StdioServerTransport()
  await localServer.connect(stdioTransport)
}
