import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'immunograph-live-bcell-verifier', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    IEDB_BCELL_ENABLED: 'true',
  },
});
await client.connect(transport);
try {
  const sequence = 'MKWVTFISLLFLFSSAYS';
  const response = await client.callTool({
    name: 'predict_bcell',
    arguments: {
      runId: 'live-bcell', proteinRef: 'sample', sequence,
      methods: ['bepipred-3.0'], parameters: {}, fallbackPolicy: 'LIVE_ONLY',
    },
  }, { timeout: 360000 });
  const result = response.structuredContent as { ok: boolean; error?: { code: string; message: string }; data?: Record<string, any> };
  assert.equal(result.ok, true, `${result.error?.code}: ${result.error?.message}`);
  assert.equal(result.data?.provenance[0].status, 'LIVE');
  assert.equal(result.data?.provenance[0].method, 'bepipred-3.0');
  assert.equal(result.data?.residueScores.length, sequence.length);
  assert.ok(result.data?.residueScores.every((item: { score: number }) => item.score >= 0 && item.score <= 1));
  assert.match(result.data?.rawMethodFields.resultUri, /^https:\/\/api-nextgen-tools\.iedb\.org\/api\/v1\/results\//u);
  console.log(JSON.stringify({ method: result.data?.provenance[0].method, sourceStatus: result.data?.provenance[0].status, residueCount: result.data?.residueScores.length, regions: result.data?.regions.length, resultUri: result.data?.rawMethodFields.resultUri }));
} finally { await client.close(); }
