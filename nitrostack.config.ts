export default {
  app: {
    name: 'immunograph-mcp',
    version: '0.1.0',
    description:
      'ImmunoGraph MCP app exposing immunoinformatics, structure, chemistry, docking, evidence, governance, and report tools.',
  },
  server: {
    host: process.env.HOST ?? process.env.MCP_HOST ?? '0.0.0.0',
    port: Number(process.env.PORT ?? process.env.MCP_PORT ?? 3001),
    basePath: '/mcp',
    transport: process.env.MCP_TRANSPORT_TYPE ?? 'dual',
  },
  build: {
    command: 'npm run mcp:build',
    startCommand: 'npm run mcp:start',
    dockerfile: 'Dockerfile.mcp',
  },
  deployment: {
    artifact: 'apps/mcp',
    include: ['apps/mcp', 'packages/shared', 'packages/algorithms', 'packages/database', 'data'],
  },
};
