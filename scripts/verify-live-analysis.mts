import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const python = required('SCIENTIFIC_PYTHON_COMMAND');
const outputDirectory = resolve(required('IMMUNOGRAPH_LIVE_OUTPUT_DIR'));
const pdb = await readFile(required('IMMUNOGRAPH_LIVE_STRUCTURE_PDB'));
const complex = await readFile(required('IMMUNOGRAPH_LIVE_COMPLEX_PDB'));
const posesPdbqt = await readFile(required('IMMUNOGRAPH_LIVE_POSES_PDBQT'));
const referenceSequence = 'MDPSSPNYDKWEMERTDITMKHKLGGGQYGEVYEGVWKKYSLTVAVKTLKEDTMEVEEFLKEAAVMKEIKHPNLVQLLGVCTREPPFYIITEFMTYGNLLDYLRECNRQEVSAVVLLYMATQISSAMEYLEKKNFIHRDLAARNCLVGENHLVKVADFGLSRLMTGDTYTAHAGAKFPIKWTAPESLAYNKFSIKSDVWAFGVLLWEIATYGMSPYPGIDLSQVYELLEKDYRMERPEGCPEKVYELMRACWQWNPSDRPSFAEIHQAFETMFQ';
const client = new Client({ name: 'immunograph-live-analysis-verifier', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    PLIP_ENABLED: 'true', FREESASA_ENABLED: 'true', MOLSTAR_ENABLED: 'true', SCIENTIFIC_PYTHON_COMMAND: python,
    FPOCKET_ENABLED: 'true', FPOCKET_COMMAND: required('FPOCKET_COMMAND'), FPOCKET_WSL_DISTRO: process.env.FPOCKET_WSL_DISTRO ?? '',
  },
});
await client.connect(transport);
await mkdir(outputDirectory, { recursive: true });

async function call(name: string, args: Record<string, unknown>) {
  const response = await client.callTool({ name, arguments: args }, { timeout: 180000 });
  const result = response.structuredContent as { ok: boolean; error?: { code: string; message: string }; data?: Record<string, any> };
  assert.equal(result.ok, true, `${name}: ${result.error?.code}: ${result.error?.message}`);
  assert.ok(result.data);
  return result.data;
}

async function save(artifact: { fileName: string; contentBase64: string; byteLength: number; sha256: string }) {
  const bytes = Buffer.from(artifact.contentBase64, 'base64');
  assert.equal(bytes.byteLength, artifact.byteLength);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  await writeFile(join(outputDirectory, artifact.fileName), bytes);
  return { fileName: artifact.fileName, byteLength: artifact.byteLength, sha256: artifact.sha256 };
}

try {
  const proteinAtoms = pdb.toString('utf8').split(/\r?\n/u).filter((line) => line.startsWith('ATOM  '));
  const residueCount = new Set(proteinAtoms.map((line) => `${line[21]}:${line.slice(22, 27)}`)).size;
  const validation = await call('validate_structure', {
    runId: 'live-analysis-1iep', structureId: '1IEP', format: 'PDB', chainIds: ['A'],
    residueCount, sourceStatus: 'LIVE', structurePdbBase64: pdb.toString('base64'),
  });
  assert.equal(validation.valid, true);
  assert.equal(validation.provenance.status, 'LIVE');
  const mapping = await call('map_epitopes_to_structure', {
    runId: 'live-analysis-1iep', structureId: '1IEP', mappingMode: 'DIRECT_COORDINATE',
    referenceSequence, structurePdbBase64: pdb.toString('base64'),
    candidates: [{ candidateId: 'abl-n-terminal-9', start: 1, end: 9, chainId: 'A' }],
  });
  assert.equal(mapping.provenance.status, 'LIVE');
  assert.equal(mapping.mappings[0].status, 'MAPPED');
  assert.equal(mapping.mappings[0].start, 225);
  assert.equal(mapping.mappings[0].end, 233);
  const accessibility = await call('calculate_surface_accessibility', {
    runId: 'live-analysis-1iep', method: 'freesasa', structurePdbBase64: pdb.toString('base64'),
    mappings: [{ candidateId: 'abl-n-terminal-9', structureId: '1IEP', chainId: 'A', start: 225, end: 233 }],
  });
  assert.equal(accessibility.provenance.status, 'LIVE');
  assert.equal(accessibility.accessibility[0].status, 'CALCULATED');
  assert.ok(accessibility.accessibility[0].surfaceAccessibility > 0);
  const sasaArtifact = await save(accessibility.artifacts[0]);
  const interactions = await call('extract_interactions', {
    runId: 'live-analysis-1iep', dockingRunId: '1iep-imatinib',
    representativePoseIds: ['1iep-imatinib-pose-1'], method: 'plip',
    complexPdbBase64: complex.toString('base64'),
  });
  assert.equal(interactions.provenance.status, 'LIVE');
  assert.ok(interactions.interactions.length > 0);
  assert.ok(interactions.interactions.every((item: any) => item.distanceAngstrom > 0 && item.residueRef.startsWith('A:')));
  const plipArtifact = await save(interactions.artifacts[0]);
  const ligandPdb = `${complex.toString('utf8').split(/\r?\n/u).filter((line) => line.startsWith('HETATM')).join('\n')}\nEND\n`;
  const viewer = await call('create_molstar_view', {
    runId: 'live-analysis-1iep', viewId: '1iep-imatinib-molstar',
    structureArtifactRef: 'rcsb-1IEP.pdb', ligandArtifactRef: 'top-pose.pdb', mode: 'DOCKING',
    structurePdbBase64: pdb.toString('base64'), ligandPdbBase64: Buffer.from(ligandPdb).toString('base64'),
  });
  assert.equal(viewer.viewer.sourceStatus, 'LIVE');
  const molstarArtifact = await save(viewer.artifact);
  const pockets = await call('detect_binding_pockets', {
    runId: 'live-analysis-1iep', structureId: '1IEP', structureArtifactRef: 'rcsb-1IEP.pdb',
    method: 'fpocket', structurePdbBase64: pdb.toString('base64'),
  });
  assert.equal(pockets.provenance.status, 'LIVE');
  assert.ok(pockets.pockets.length > 0);
  assert.ok(pockets.pockets.some((pocket: any) => Math.abs(pocket.center.x) > 1));
  const fpocketArtifact = await save(pockets.artifacts[0]);
  const vinaMatches = [...posesPdbqt.toString('utf8').matchAll(/^REMARK VINA RESULT:\s*(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gmu)];
  assert.ok(vinaMatches.length > 1);
  const clusters = await call('cluster_docking_poses', {
    runId: 'live-analysis-1iep', dockingRunId: '1iep-imatinib', method: 'HIERARCHICAL',
    posesPdbqtBase64: posesPdbqt.toString('base64'), rmsdThresholdAngstrom: 2,
    poses: vinaMatches.map((match, index) => ({
      poseId: `1iep-imatinib-pose-${index + 1}`, rank: index + 1,
      affinityKcalMol: Number(match[1]), rmsdLowerBound: Number(match[2]), rmsdUpperBound: Number(match[3]),
    })),
  });
  assert.equal(clusters.provenance.status, 'LIVE');
  assert.equal(clusters.clusters.flatMap((cluster: any) => cluster.poseIds).length, vinaMatches.length);
  const parker = await call('predict_bcell', {
    runId: 'live-analysis-1iep', proteinRef: '1iep-chain-a', sequence: referenceSequence,
    methods: ['parker'], parameters: {}, fallbackPolicy: 'LIVE_ONLY',
  });
  assert.equal(parker.provenance[0].status, 'LIVE');
  assert.equal(parker.residueScores.length, referenceSequence.length - 6);
  const summary = { validation: { valid: validation.valid, residueCount }, mapping: mapping.mappings, accessibility: accessibility.accessibility, interactions: interactions.interactions,
    clusters: clusters.clusters, pockets: { count: pockets.pockets.length, top: pockets.pockets[0] },
    parker: { scoreCount: parker.residueScores.length, regionCount: parker.regions.length, firstScore: parker.residueScores[0] },
    artifacts: [sasaArtifact, plipArtifact, molstarArtifact, fpocketArtifact], inputSha256: { pdb: createHash('sha256').update(pdb).digest('hex'), complex: createHash('sha256').update(complex).digest('hex') } };
  await writeFile(join(outputDirectory, 'live-analysis-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await client.close();
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
