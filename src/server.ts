import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/server';
import type { ServerContext } from '@modelcontextprotocol/server';

import { createToolGroups } from './modules/tool-catalog.js';
import { ReportController } from './modules/report/report.controller.js';
import { registeredHandlers } from './modules/common/mcp-compat.js';
import type { ExecutionContext } from './modules/common/mcp-compat.js';
import { publicToolDefinition } from './modules/tool-public-docs.js';

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
  const groups = createToolGroups();
  const handlers = new Map<string, (input: unknown, context: ExecutionContext) => Promise<unknown>>();
  for (const group of groups) {
    for (const { method, options } of registeredHandlers(group.controller)) {
      if (names.has(options.name)) throw new Error(`Duplicate MCP tool: ${options.name}`);
      names.add(options.name);
      const handler = group.controller[method];
      if (typeof handler !== 'function') throw new Error(`Missing handler: ${method}`);
      handlers.set(options.name, (input, context) => Promise.resolve(handler.call(group.controller, input, context)));
      const publicDefinition = publicToolDefinition(options);
      server.registerTool(
        options.name,
        {
          description: publicDefinition.description,
          inputSchema: publicDefinition.inputSchema,
          outputSchema: publicDefinition.outputSchema,
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
  for (const group of groups) {
    if (group.controller instanceof ReportController) {
      group.controller.useToolInvoker(async (toolName, args, parentContext) => {
        if (toolName === 'run_agentic_workflow') throw new Error('Recursive workflow calls are forbidden.');
        const handler = handlers.get(toolName);
        if (!handler) throw new Error(`Unknown MCP tool: ${toolName}`);
        return handler(args, parentContext);
      });
    }
  }
  return server;
}
