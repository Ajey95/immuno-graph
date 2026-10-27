import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const receptorPath = required('IMMUNOGRAPH_LIVE_RECEPTOR_PDBQT');
const ligandPath = required('IMMUNOGRAPH_LIVE_LIGAND_PDBQT');
const outputDirectory = resolve(required('IMMUNOGRAPH_LIVE_OUTPUT_DIR'));
const vinaCommand = required('VINA_COMMAND');
const python = required('SCIENTIFIC_PYTHON_COMMAND');
const receptor = await readFile(receptorPath);
const ligand = await readFile(ligandPath);

const client = new Client({ name: 'immunograph-live-docking-verifier', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    VINA_ENABLED: 'true',
    VINA_COMMAND: vinaCommand,
    VINA_WSL_DISTRO: process.env.VINA_WSL_DISTRO ?? '',
    PLIP_ENABLED: 'true',
    SCIENTIFIC_PYTHON_COMMAND: python,
    DOCKING_COMMAND_TIMEOUT_MS: '600000',
  },
});
await client.connect(transport);
try {
  const response = await client.callTool({
    name: 'run_docking',
    arguments: {
      runId: 'real-1iep-verification',
      receptorId: '1iep-receptor',
      ligandId: '1iep-ligand',
      dockingBoxId: '1iep-documented-box',
      mode: 'VINA',
      fallbackPolicy: 'LIVE_ONLY',
      receptorPdbqtBase64: receptor.toString('base64'),
      ligandPdbqtBase64: ligand.toString('base64'),
      box: { center: { x: 15.190, y: 53.903, z: 16.917 }, size: { x: 20, y: 20, z: 20 } },
      seed: 42,
      exhaustiveness: 8,
      numModes: 3,
      cpu: 2,
    },
  }, { timeout: 650000 });
  const result = response.structuredContent as {
    ok: boolean;
    error?: { code: string; message: string };
    data?: {
      dockingRun: { sourceStatus: string };
      poses: Array<{ rank: number; affinityKcalMol: number }>;
      artifacts: Array<{ fileName: string; sha256: string; byteLength: number; contentBase64: string }>;
    };
  };
  assert.equal(result.ok, true, `${result.error?.code}: ${result.error?.message}`);
  assert.equal(result.data?.dockingRun.sourceStatus, 'LIVE');
  assert.ok((result.data?.poses.length ?? 0) > 0);
  await mkdir(outputDirectory, { recursive: true });
  for (const artifact of result.data?.artifacts ?? []) {
    const bytes = Buffer.from(artifact.contentBase64, 'base64');
    assert.equal(bytes.byteLength, artifact.byteLength);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
    await writeFile(join(outputDirectory, artifact.fileName), bytes);
  }
  const complexArtifact = result.data?.artifacts.find((artifact) => artifact.fileName === 'complex.pdb');
  assert.ok(complexArtifact, 'run_docking did not export complex.pdb');
  const interactionResponse = await client.callTool({
    name: 'extract_interactions',
    arguments: {
      runId: 'real-1iep-verification', dockingRunId: '1iep-receptor-1iep-ligand-1iep-documented-box',
      representativePoseIds: ['1iep-receptor-1iep-ligand-1iep-documented-box-pose-1'],
      method: 'plip', complexPdbBase64: complexArtifact.contentBase64,
    },
  }, { timeout: 180000 });
  const interactionResult = interactionResponse.structuredContent as {
    ok: boolean; error?: { code: string; message: string };
    data?: { interactions: Array<{ interactionType: string }>; artifacts: Array<{ fileName: string; contentBase64: string; sha256: string; byteLength: number }> };
  };
  assert.equal(interactionResult.ok, true, `${interactionResult.error?.code}: ${interactionResult.error?.message}`);
  assert.ok((interactionResult.data?.interactions.length ?? 0) > 0);
  for (const artifact of interactionResult.data?.artifacts ?? []) {
    const bytes = Buffer.from(artifact.contentBase64, 'base64');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
    await writeFile(join(outputDirectory, artifact.fileName), bytes);
  }
  console.log(JSON.stringify({
    status: 'LIVE',
    poses: result.data?.poses,
    artifacts: result.data?.artifacts.map(({ fileName, sha256, byteLength }) => ({ fileName, sha256, byteLength })),
    plipContactCount: interactionResult.data?.interactions.length,
    outputDirectory,
  }, null, 2));
} finally {
  await client.close();
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
