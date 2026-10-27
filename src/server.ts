import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/server';
import type { ServerContext } from '@modelcontextprotocol/server';

import { createToolGroups } from './modules/tool-catalog.js';
import { registeredHandlers } from './modules/common/mcp-compat.js';
import type { ExecutionContext } from './modules/common/mcp-compat.js';

const logger: ExecutionContext['logger'] = {
  info: (event, details) => console.error(JSON.stringify({ level: 'info', event, ...details })),
  warn: (event, details) => console.error(JSON.stringify({ level: 'warn', event, ...details })),
  error: (event, details) => console.error(JSON.stringify({ level: 'error', event, ...details })),
};

function executionContext(context: ServerContext): ExecutionContext {
  const signal = context.mcpReq.signal;
  return {
    requestId: String(context.mcpReq.id ?? randomUUID()),
    logger,
    task: {
      throwIfCancelled: () => signal.throwIfAborted(),
      updateProgress: () => undefined,
    },
  };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'immunograph-mcp', version: '0.2.0' });
  const names = new Set<string>();
  for (const group of createToolGroups()) {
    for (const { method, options } of registeredHandlers(group.controller)) {
      if (names.has(options.name)) throw new Error(`Duplicate MCP tool: ${options.name}`);
      names.add(options.name);
      const handler = group.controller[method];
      if (typeof handler !== 'function') throw new Error(`Missing handler: ${method}`);
      server.registerTool(
        options.name,
        {
          description: options.description,
          inputSchema: options.inputSchema,
          annotations: options.annotations,
        },
        async (input, context) => {
          const result: unknown = await handler.call(group.controller, input, executionContext(context));
          const value = result as { ok?: boolean };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            structuredContent: result as Record<string, unknown>,
            isError: value.ok === false,
          };
        },
      );
    }
  }
  return server;
}
