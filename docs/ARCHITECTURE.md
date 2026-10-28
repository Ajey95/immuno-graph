# Architecture

ImmunoGraph is one MCP server with 46 tools. `src/server.ts` creates an official `McpServer` and registers the seven groups in `src/modules/tool-catalog.ts`. The existing controllers contain the scientific tool handlers. A small local registration helper in `src/modules/common/mcp-compat.ts` reads their tool declarations; no third-party framework owns registration or transport.

```text
MCP client
  |  stdio (src/index.ts) or Streamable HTTP (src/http.ts)
  v
Official MCP SDK (src/server.ts)
  |  Zod input validation and tool dispatch
  v
Scientific controllers (src/modules/)
  |  executeTool: validated result envelope, hashes, provenance, timing
  v
Deterministic algorithms, optional connectors, versioned data and fixtures
```

The SDK derives discoverable JSON Schema from the Zod input contracts. `executeTool` validates input again for its existing error envelope, validates output, and returns a structured success or failure result. The MCP adapter emits both text content and `structuredContent`, with `isError` on a failed tool result. Log events go to stderr, keeping stdio stdout reserved for MCP messages.

For HTTP, `createMcpHandler` builds a fresh `McpServer` per request. `src/http-server.ts` restricts Host and Origin, checks bearer authentication when configured, exposes `/mcp`, and provides a public `/health` probe. Binding beyond loopback requires an API key and explicit host/origin lists. TLS and connector egress rules belong at the deployment ingress.

Reference/profile files live in `data/`; fixture predictions are exact-match and labeled `FIXTURE`; synthetic outputs are labeled `SYNTHETIC`. Live adapters require explicit configuration. The LangGraph workflow can execute caller-supplied approved `toolCalls` through the registered handlers and return their results. A client supplies the typed arguments and passes evidence between calls; without `toolCalls`, LangGraph returns a plan only.
