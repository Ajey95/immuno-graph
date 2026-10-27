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
  ['extract_interactions', { runId: 'guard', dockingRunId: 'run-1', representativePoseIds: ['pose-1'], method: 'plip' }, 'PLIP_COMPLEX_REQUIRED'],
  ['calculate_surface_accessibility', { runId: 'guard', method: 'freesasa', mappings: [{ candidateId: 'c1', structureId: 's1', chainId: 'A', start: 1, end: 9 }] }, 'FREESASA_STRUCTURE_REQUIRED'],
  ['detect_binding_pockets', { runId: 'guard', structureId: 's1', structureArtifactRef: 's1.pdb', method: 'fpocket' }, 'FPOCKET_STRUCTURE_REQUIRED'],
  ['create_molstar_view', { runId: 'guard', viewId: 'view-1', structureArtifactRef: 's1.pdb', mode: 'STRUCTURE' }, 'MOLSTAR_STRUCTURE_REQUIRED'],
  ['map_epitopes_to_structure', { runId: 'guard', structureId: 's1', candidates: [{ candidateId: 'c1', start: 1, end: 9 }], mappingMode: 'DIRECT_COORDINATE' }, 'STRUCTURE_MAPPING_INPUT_REQUIRED'],
  ['validate_structure', { runId: 'guard', structureId: 's1', format: 'PDB', chainIds: ['A'], residueCount: 9, sourceStatus: 'LIVE' }, 'STRUCTURE_PDB_REQUIRED'],
  ['cluster_docking_poses', { runId: 'guard', dockingRunId: 'run-1', method: 'DBSCAN', poses: [{ poseId: 'p1', rank: 1, affinityKcalMol: -5, rmsdLowerBound: 0, rmsdUpperBound: 0 }] }, 'CLUSTER_COORDINATES_REQUIRED'],
  ['predict_bcell', { runId: 'guard', proteinRef: 's1', methods: ['parker'], parameters: {}, fallbackPolicy: 'LIVE_ONLY' }, 'PARKER_SEQUENCE_REQUIRED'],
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
