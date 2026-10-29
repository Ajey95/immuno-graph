import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const python = process.env.RDKIT_PYTHON_COMMAND;
if (!python) throw new Error('RDKIT_PYTHON_COMMAND is required');
const client = new Client({ name: 'immunograph-live-chemistry-verifier', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    RDKIT_ENABLED: 'true', RDKIT_PYTHON_COMMAND: python,
  },
});
await client.connect(transport);
async function call(name: string, args: Record<string, unknown>) {
  const response = await client.callTool({ name, arguments: args }, { timeout: 120000 });
  const result = response.structuredContent as { ok: boolean; error?: { code: string; message: string }; data?: Record<string, any> };
  assert.equal(result.ok, true, `${name}: ${result.error?.code}: ${result.error?.message}`);
  assert.ok(result.data);
  return result.data;
}
try {
  const validation = await call('validate_compound', { runId: 'live-chemistry', compoundId: 'ethanol', smiles: 'CCO', sourceStatus: 'LIVE' });
  assert.equal(validation.valid, true);
  assert.equal(validation.provenance.status, 'LIVE');
  assert.ok(validation.checks[0].message.includes('3 heavy atoms'));
  const deduplicated = await call('deduplicate_compounds', {
    runId: 'live-chemistry', compounds: [
      { compoundId: 'ethanol-a', smiles: 'CCO', sourceStatus: 'LIVE' },
      { compoundId: 'ethanol-b', smiles: 'OCC', sourceStatus: 'LIVE' },
      { compoundId: 'dimethyl-ether', smiles: 'COC', sourceStatus: 'LIVE' },
    ],
  });
  assert.equal(deduplicated.provenance.status, 'LIVE');
  assert.deepEqual(deduplicated.canonicalCompoundIds, ['ethanol-a', 'dimethyl-ether']);
  assert.equal(deduplicated.duplicateLinks[0].duplicateId, 'ethanol-b');
  console.log(JSON.stringify({ validation: validation.valid, canonicalCompoundIds: deduplicated.canonicalCompoundIds, duplicateLinks: deduplicated.duplicateLinks }));
} finally { await client.close(); }
