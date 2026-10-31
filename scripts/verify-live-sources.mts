import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const outputDirectory = resolve(required('IMMUNOGRAPH_LIVE_OUTPUT_DIR'));
const python = required('MEEKO_PYTHON_COMMAND');
const receptorPdb = await readFile(required('IMMUNOGRAPH_LIVE_RECEPTOR_PDB'));
const client = new Client({ name: 'immunograph-live-sources-verifier', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    RCSB_PDB_ENABLED: 'true',
    PUBCHEM_ENABLED: 'true',
    RDKIT_ENABLED: 'true',
    RDKIT_PYTHON_COMMAND: python,
    IEDB_LIVE_ENABLED: 'true',
    MEEKO_ENABLED: 'true',
    MEEKO_PYTHON_COMMAND: python,
  },
});
await client.connect(transport);
await mkdir(outputDirectory, { recursive: true });

async function call(name: string, args: Record<string, unknown>) {
  const response = await client.callTool({ name, arguments: args }, { timeout: 180000 });
  const result = response.structuredContent as {
    ok: boolean;
    error?: { code: string; message: string };
    data?: Record<string, any>;
  };
  assert.equal(result.ok, true, `${name}: ${result.error?.code}: ${result.error?.message}`);
  assert.ok(result.data, `${name}: missing data`);
  return result.data;
}

async function saveArtifact(artifact: { fileName: string; contentBase64: string; sha256: string; byteLength: number }, prefix: string) {
  const bytes = Buffer.from(artifact.contentBase64, 'base64');
  assert.equal(bytes.byteLength, artifact.byteLength);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  await writeFile(join(outputDirectory, `${prefix}-${artifact.fileName}`), bytes);
  return { fileName: `${prefix}-${artifact.fileName}`, sha256: artifact.sha256, byteLength: bytes.byteLength };
}

try {
  const structure = await call('fetch_structure', {
    runId: 'live-sources-verification', targetId: '1uyd-target', source: 'RCSB_PDB', accession: '1UYD', fallbackPolicy: 'LIVE_ONLY',
  });
  assert.equal(structure.structure.sourceStatus, 'LIVE');
  const structureArtifact = await saveArtifact(structure.structure.artifact, 'rcsb');
  const dockingStructure = await call('fetch_structure', {
    runId: 'live-sources-verification', targetId: 'c-abl', source: 'RCSB_PDB', accession: '1IEP', fallbackPolicy: 'LIVE_ONLY',
  });
  assert.equal(dockingStructure.structure.sourceStatus, 'LIVE');
  const dockingStructureArtifact = await saveArtifact(dockingStructure.structure.artifact, 'rcsb');

  const compound = await call('fetch_compound', {
    runId: 'live-sources-verification', compoundRef: '2244', source: 'PUBCHEM', fallbackPolicy: 'LIVE_ONLY',
  });
  assert.equal(compound.compound.sourceStatus, 'LIVE');
  assert.equal(compound.compound.compoundId, '2244');

  const descriptors = await call('calculate_molecular_descriptors', {
    runId: 'live-sources-verification', compoundId: '2244', smiles: compound.compound.smiles, method: 'rdkit',
  });
  assert.equal(descriptors.provenance.status, 'LIVE');

  const receptor = await call('prepare_receptor', {
    runId: 'live-sources-verification', structureId: '1iep', chainIds: ['A'], preparationMethod: 'meeko', structurePdbBase64: receptorPdb.toString('base64'),
  });
  assert.equal(receptor.sourceStatus, 'LIVE');
  const receptorArtifact = await saveArtifact(receptor.artifact, 'meeko');
  const pdbReceptor = await call('prepare_receptor', {
    runId: 'live-sources-verification', structureId: '1iep-rcsb', chainIds: ['A'], preparationMethod: 'meeko',
    structurePdbBase64: dockingStructure.structure.artifact.contentBase64,
  });
  assert.equal(pdbReceptor.sourceStatus, 'LIVE');
  const pdbReceptorArtifact = await saveArtifact(pdbReceptor.artifact, 'rcsb-meeko');

  const ligand = await call('prepare_ligand', {
    runId: 'live-sources-verification', compoundId: '2244', smiles: compound.compound.smiles, preparationMethod: 'meeko',
  });
  assert.equal(ligand.sourceStatus, 'LIVE');
  const ligandArtifacts = [];
  for (const artifact of ligand.artifacts) ligandArtifacts.push(await saveArtifact(artifact, 'meeko'));

  const imatinib = await call('fetch_compound', {
    runId: 'live-sources-verification', compoundRef: '5291', source: 'PUBCHEM', fallbackPolicy: 'LIVE_ONLY',
  });
  assert.equal(imatinib.compound.sourceStatus, 'LIVE');
  const imatinibLigand = await call('prepare_ligand', {
    runId: 'live-sources-verification', compoundId: '5291', smiles: imatinib.compound.smiles, preparationMethod: 'meeko',
  });
  assert.equal(imatinibLigand.sourceStatus, 'LIVE');
  const imatinibArtifacts = [];
  for (const artifact of imatinibLigand.artifacts) imatinibArtifacts.push(await saveArtifact(artifact, 'imatinib'));

  const binding = await call('predict_mhci', {
    runId: 'live-sources-verification', sequence: 'SLYNTVATL', alleles: ['HLA-A*02:01'], peptideLengths: [9], methods: ['iedb-recommended'], fallbackPolicy: 'LIVE_ONLY',
  });
  assert.equal(binding.provenance[0]?.status, 'LIVE');
  assert.ok(binding.observations.length > 0);
  await writeFile(join(outputDirectory, 'iedb-mhci-result.json'), JSON.stringify(binding, null, 2));
  const bindingII = await call('predict_mhcii', {
    runId: 'live-sources-verification', sequence: 'AAASLYNTVATLAAA', alleles: ['HLA-DRB1*01:01'], peptideLengths: [15], methods: ['iedb-recommended'], fallbackPolicy: 'LIVE_ONLY',
  });
  assert.equal(bindingII.provenance[0]?.status, 'LIVE');
  assert.ok(bindingII.observations.length > 0);
  await writeFile(join(outputDirectory, 'iedb-mhcii-result.json'), JSON.stringify(bindingII, null, 2));
  console.log(JSON.stringify({
    structure: { status: structure.structure.sourceStatus, accession: '1UYD', artifact: structureArtifact },
    dockingStructure: { status: dockingStructure.structure.sourceStatus, accession: '1IEP', artifact: dockingStructureArtifact },
    compound: { status: compound.compound.sourceStatus, cid: '2244', smiles: compound.compound.smiles },
    descriptors: { status: descriptors.provenance.status, values: descriptors.descriptors },
    receptor: { status: receptor.sourceStatus, artifact: receptorArtifact },
    pdbReceptor: { status: pdbReceptor.sourceStatus, artifact: pdbReceptorArtifact },
    ligand: { status: ligand.sourceStatus, artifacts: ligandArtifacts },
    imatinib: { status: imatinib.compound.sourceStatus, cid: '5291', artifacts: imatinibArtifacts },
    mhci: { provider: binding.provenance[0]?.connectorId, status: binding.provenance[0]?.status, resultCount: binding.observations.length },
    mhcii: { provider: bindingII.provenance[0]?.connectorId, status: bindingII.provenance[0]?.status, resultCount: bindingII.observations.length },
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
