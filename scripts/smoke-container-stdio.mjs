import assert from 'node:assert/strict';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const image = process.env.IMMUNOGRAPH_SMOKE_IMAGE ?? 'ghcr.io/ajey95/immuno-graph:0.2.0';
const client = new Client({ name: 'immunograph-container-stdio-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'docker',
  args: ['run', '--rm', '-i', image, 'node', 'dist/index.js'],
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 46);
  const result = await client.callTool({ name: 'validate_sequence', arguments: { fasta: '>oci\nACDEFGHIK' } });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent?.data?.normalizedSequence, 'ACDEFGHIK');
  console.log('OCI container stdio: 46-tool discovery and MCP tool call passed.');
} finally {
  await client.close();
}
