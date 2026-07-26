export default {
  app: {
    name: 'immunograph-mcp',
    version: '0.1.0',
    description:
      'ImmunoGraph MCP app exposing immunoinformatics, structure, chemistry, docking, evidence, governance, and report tools.',
  },
  server: {
    name: 'immunograph-mcp',
    version: '0.1.0',
    host: process.env.HOST ?? process.env.MCP_HOST ?? '0.0.0.0',
    port: Number(
      process.env.PORT ??
        process.env.MCP_PORT ??
        (process.env.NODE_ENV === 'production' ? 3000 : 3001),
    ),
    basePath: '/mcp',
    transport:
      process.env.MCP_TRANSPORT_TYPE ??
      (process.env.NODE_ENV === 'production' ? 'http' : 'dual'),
  },
  build: {
    command: 'npm run nitro:build',
    startCommand: 'npm start',
    dockerfile: 'Dockerfile.mcp',
  },
  deployment: {
    artifact: 'apps/mcp',
    include: ['apps/mcp', 'packages/shared', 'packages/algorithms', 'packages/database', 'data'],
  },
};
