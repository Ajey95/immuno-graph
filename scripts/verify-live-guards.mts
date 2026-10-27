import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'immunograph-live-guard-verifier', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    PLIP_ENABLED: 'true', FREESASA_ENABLED: 'true', FPOCKET_ENABLED: 'true', MOLSTAR_ENABLED: 'true',
  },
});
await client.connect(transport);
const cases = [
  ['extract_interactions', { runId: 'guard', dockingRunId: 'run-1', representativePoseIds: ['pose-1'], method: 'plip' }, 'PLIP_INPUT_AND_PARSER_REQUIRED'],
  ['calculate_surface_accessibility', { runId: 'guard', method: 'freesasa', mappings: [{ candidateId: 'c1', structureId: 's1', chainId: 'A', start: 1, end: 9 }] }, 'FREESASA_STRUCTURE_REQUIRED'],
  ['detect_binding_pockets', { runId: 'guard', structureId: 's1', structureArtifactRef: 's1.pdb', method: 'fpocket' }, 'FPOCKET_FILE_AND_PARSER_REQUIRED'],
  ['create_molstar_view', { runId: 'guard', viewId: 'view-1', structureArtifactRef: 's1.pdb', mode: 'STRUCTURE' }, 'MOLSTAR_EXPORT_REQUIRED'],
  ['map_epitopes_to_structure', { runId: 'guard', structureId: 's1', candidates: [{ candidateId: 'c1', start: 1, end: 9 }], mappingMode: 'DIRECT_COORDINATE' }, 'STRUCTURE_MAPPING_INPUT_REQUIRED'],
] as const;
try {
  for (const [name, args, code] of cases) {
    const response = await client.callTool({ name, arguments: args });
    const result = response.structuredContent as { ok: boolean; error?: { code: string } };
    assert.equal(result.ok, false, `${name} unexpectedly reported success`);
    assert.equal(result.error?.code, code);
    console.log(`${name}: ${code}`);
  }
} finally {
  await client.close();
}
