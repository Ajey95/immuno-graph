import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'immunograph-live-population-verifier', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    IEDB_POPULATION_COVERAGE_ENABLED: 'true',
  },
});
await client.connect(transport);
try {
  const response = await client.callTool({
    name: 'calculate_population_coverage',
    arguments: {
      runId: 'live-population',
      associations: [{ candidateId: 'epitope-1', peptide: 'GILGFVFTL', allele: 'HLA-A*02:01' }],
      populationIds: ['world'],
      classMode: 'CLASS_I',
      fallbackPolicy: 'LIVE_ONLY',
    },
  }, { timeout: 120000 });
  const result = response.structuredContent as { ok: boolean; error?: { code: string; message: string }; data?: Record<string, any> };
  assert.equal(result.ok, true, `${result.error?.code}: ${result.error?.message}`);
  assert.equal(result.data?.provenance.status, 'LIVE');
  assert.equal(result.data?.provenance.connectorVersion, 'iedb-nextgen-api-v1');
  assert.ok(result.data?.projectedCoverage > 0 && result.data?.projectedCoverage < 1);
  assert.equal(result.data?.metrics.populations.length, 1);
  console.log(JSON.stringify({ projectedCoverage: result.data?.projectedCoverage, population: result.data?.metrics.populations[0], resultUri: result.data?.metrics.resultUri }));
} finally { await client.close(); }
