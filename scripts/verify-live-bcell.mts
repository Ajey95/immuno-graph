import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'immunograph-live-bcell-verifier', version: '1.0.0' });
const outputDirectory = resolve(process.env.IMMUNOGRAPH_LIVE_OUTPUT_DIR ?? join(process.cwd(), 'outputs', 'bcell'));
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
  const sequence = process.env.IMMUNOGRAPH_BCELL_SEQUENCE ?? 'MKWVTFISLLFLFSSAYS';
  const proteinRef = process.env.IMMUNOGRAPH_BCELL_PROTEIN_REF ?? 'sample';
  assert.match(sequence, /^[ACDEFGHIKLMNPQRSTVWY]{7,}$/u);
  const response = await client.callTool({
    name: 'predict_bcell',
    arguments: {
      runId: 'live-bcell', proteinRef, sequence,
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
  const files = {
    'bepipred-results.json': Buffer.from(JSON.stringify({ sequence, ...result.data }, null, 2)),
    'bepipred-residues.csv': Buffer.from(`position,residue,score\n${result.data?.residueScores.map((item: { position: number; score: number }) => `${item.position},${sequence[item.position - 1]},${item.score}`).join('\n')}\n`),
  };
  await mkdir(outputDirectory, { recursive: true });
  const exports = [];
  for (const [fileName, bytes] of Object.entries(files)) {
    await writeFile(join(outputDirectory, fileName), bytes);
    exports.push({ fileName, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  console.log(JSON.stringify({ method: result.data?.provenance[0].method, sourceStatus: result.data?.provenance[0].status, residueCount: result.data?.residueScores.length, regions: result.data?.regions.length, resultUri: result.data?.rawMethodFields.resultUri, exports, outputDirectory }, null, 2));
} finally { await client.close(); }
