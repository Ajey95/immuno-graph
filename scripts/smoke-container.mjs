import assert from 'node:assert/strict';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const url = new URL(process.env.IMMUNOGRAPH_SMOKE_URL ?? 'http://127.0.0.1:3000/mcp');
const apiKey = process.env.IMMUNOGRAPH_SMOKE_API_KEY;
if (!apiKey) throw new Error('IMMUNOGRAPH_SMOKE_API_KEY is required');

let health;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    health = await fetch(new URL('/health', url));
    if (health.ok) break;
  } catch {
    // The container may still be starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(health?.status, 200, 'Container health probe must succeed');
assert.equal((await health.json()).server, 'immunograph-mcp');

const denied = await fetch(url, { method: 'POST' });
assert.equal(denied.status, 401, 'MCP endpoint must reject unauthenticated calls');

const client = new Client({ name: 'immunograph-container-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 46);
  const result = await client.callTool({ name: 'validate_sequence', arguments: { fasta: '>container\nACDEFGHIK' } });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent?.data?.normalizedSequence, 'ACDEFGHIK');
  console.log('Published container: health, bearer auth, 46-tool discovery, and live MCP call passed.');
} finally {
  await client.close();
}
