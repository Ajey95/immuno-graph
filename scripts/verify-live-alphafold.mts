import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const outputDirectory = resolve(process.env.IMMUNOGRAPH_LIVE_OUTPUT_DIR ?? join(process.cwd(), 'outputs', 'alphafold-confidence'));
const accession = process.env.IMMUNOGRAPH_ALPHAFOLD_ACCESSION ?? 'P69905';
const targetId = process.env.IMMUNOGRAPH_ALPHAFOLD_TARGET_ID ?? 'hemoglobin-alpha';
const client = new Client({ name: 'immunograph-live-alphafold-verifier', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    ALPHAFOLD_DB_ENABLED: 'true',
  },
});
await client.connect(transport);

type Artifact = { fileName: string; contentBase64: string; sha256: string; byteLength: number };
async function call(name: string, args: Record<string, unknown>) {
  const response = await client.callTool({ name, arguments: args }, { timeout: 120000 });
  const result = response.structuredContent as { ok: boolean; data?: Record<string, any>; error?: { code: string; message: string } };
  assert.equal(result.ok, true, `${name}: ${result.error?.code}: ${result.error?.message}`);
  assert.ok(result.data);
  return result.data;
}
async function save(artifact: Artifact) {
  assert.match(artifact.fileName, /^[A-Za-z0-9._-]+$/u);
  assert.ok(artifact.fileName !== '.' && artifact.fileName !== '..');
  const bytes = Buffer.from(artifact.contentBase64, 'base64');
  assert.equal(bytes.byteLength, artifact.byteLength);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  await writeFile(join(outputDirectory, artifact.fileName), bytes);
}

try {
  const fetched = await call('fetch_structure', {
    runId: 'real-alphafold', targetId, source: 'ALPHAFOLD_DB',
    accession, fallbackPolicy: 'LIVE_ONLY',
  });
  assert.equal(fetched.structure.sourceStatus, 'LIVE');
  assert.equal(fetched.structure.format, 'PDB');
  assert.match(fetched.structure.artifactRef, /^https:\/\/alphafold\.ebi\.ac\.uk\/files\//u);
  const pdb = fetched.structure.artifact as Artifact;
  assert.ok(pdb);

  const confidence = await call('calculate_structure_confidence', {
    runId: 'real-alphafold', structureId: fetched.structure.structureId,
    sourceStatus: 'LIVE', modelSource: 'ALPHAFOLD_DB',
    structureArtifactRef: fetched.structure.artifactRef, structurePdbBase64: pdb.contentBase64,
  });
  assert.equal(confidence.provenance.status, 'LIVE');
  assert.equal(confidence.provenance.connectorId, 'alphafold-plddt');
  assert.ok(confidence.residueCount >= 1);
  assert.equal(confidence.residueScores.length, confidence.residueCount);
  assert.ok(confidence.residueScores.every((residue: { plddt: number }) => residue.plddt >= 0 && residue.plddt <= 100));
  assert.ok(confidence.confidenceScore >= 0 && confidence.confidenceScore <= 1);

  await mkdir(outputDirectory, { recursive: true });
  await save(pdb);
  await save(confidence.artifact as Artifact);
  console.log(JSON.stringify({
    status: 'LIVE', structureId: fetched.structure.structureId, residueCount: confidence.residueCount,
    meanPlddt: confidence.confidenceScore * 100, lowConfidenceResidueCount: confidence.lowConfidenceResidueCount,
    files: [pdb.fileName, confidence.artifact.fileName], outputDirectory,
  }, null, 2));
} finally {
  await client.close();
}
