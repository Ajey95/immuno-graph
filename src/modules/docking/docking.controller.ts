import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJsonSha256 } from '../../lib/algorithms/index.js';
import { ControllerDecorator, ToolDecorator as Tool } from '../common/mcp-compat.js';
import type { ExecutionContext } from '../common/mcp-compat.js';
import { z } from 'zod';

import {
  connectorProvenanceSchema,
  failureExample,
  identifierSchema,
  unitIntervalSchema,
} from '../common/contracts.js';
import { executeTool, ToolExecutionError } from '../common/executor.js';
import { inlineArtifact, inlineArtifactSchema } from '../common/inline-artifact.js';
import { defaultLiveToolRuntime, type LiveToolRuntime } from '../common/live-runtime.js';
import { buildStoredZip } from '../common/zip.js';
import { loadMcpEnvironment } from '../config/environment.js';

const CATEGORY = 'Docking Tools';
const sourceStatus = z.enum(['LIVE', 'CACHED', 'FIXTURE']);
const fallbackPolicy = z.enum([
  'LIVE_ONLY',
  'CACHE_THEN_LIVE',
  'CACHE_THEN_LIVE_THEN_FIXTURE',
  'LIVE_THEN_CACHE_THEN_FIXTURE',
  'FIXTURE_ONLY',
]);

const prepareReceptorInput = z
  .object({
    runId: identifierSchema,
    structureId: identifierSchema,
    chainIds: z.array(identifierSchema).min(1),
    preparationMethod: identifierSchema,
    structurePdbBase64: z.string().min(1).max(8_000_000).optional(),
  })
  .strict();
const prepareReceptorData = z
  .object({
    receptorId: identifierSchema,
    structureId: identifierSchema,
    artifactRef: identifierSchema,
    artifact: inlineArtifactSchema.optional(),
    format: z.enum(['PDBQT', 'PDB', 'FIXTURE_JSON']),
    sourceStatus,
    scientificUse: z.boolean(),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const dockingBoxInput = z
  .object({
    runId: identifierSchema,
    dockingBoxId: identifierSchema,
    center: z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }),
    size: z.object({
      x: z.number().positive(),
      y: z.number().positive(),
      z: z.number().positive(),
    }),
  })
  .strict();
const dockingBoxData = z
  .object({
    dockingBoxId: identifierSchema,
    valid: z.boolean(),
    volume: z.number().finite().positive(),
    warnings: z.array(identifierSchema),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const runDockingInput = z
  .object({
    runId: identifierSchema,
    receptorId: identifierSchema,
    ligandId: identifierSchema,
    dockingBoxId: identifierSchema,
    mode: z.enum(['VINA', 'FIXTURE']),
    fallbackPolicy,
    receptorPdbqtBase64: z.string().min(1).max(8_000_000).optional(),
    ligandPdbqtBase64: z.string().min(1).max(8_000_000).optional(),
    box: dockingBoxInput.pick({ center: true, size: true }).optional(),
    seed: z.number().int().nonnegative().default(42),
    exhaustiveness: z.number().int().min(1).max(32).default(8),
    numModes: z.number().int().min(1).max(20).default(5),
    cpu: z.number().int().min(1).max(16).default(2),
  })
  .strict();
const dockingPose = z
  .object({
    poseId: identifierSchema,
    rank: z.number().int().positive(),
    affinityKcalMol: z.number().finite(),
    rmsdLowerBound: z.number().finite().nonnegative(),
    rmsdUpperBound: z.number().finite().nonnegative(),
  })
  .strict();
const runDockingData = z
  .object({
    dockingRun: z
      .object({
        dockingRunId: identifierSchema,
        receptorId: identifierSchema,
        ligandId: identifierSchema,
        dockingBoxId: identifierSchema,
        sourceStatus,
        scientificUse: z.boolean(),
      })
      .strict(),
    poses: z.array(dockingPose).min(1),
    artifacts: z.array(inlineArtifactSchema).optional(),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const clusterInput = z
  .object({
    runId: identifierSchema,
    dockingRunId: identifierSchema,
    method: z.enum(['DBSCAN', 'HIERARCHICAL', 'FIXTURE']),
    poses: z.array(dockingPose).min(1),
  })
  .strict();
const clusterData = z
  .object({
    dockingRunId: identifierSchema,
    clusters: z.array(
      z
        .object({
          clusterId: identifierSchema,
          poseIds: z.array(identifierSchema).min(1),
          representativePoseId: identifierSchema,
          stabilityScore: unitIntervalSchema,
        })
        .strict(),
    ),
    outlierPoseIds: z.array(identifierSchema),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const interactionsInput = z
  .object({
    runId: identifierSchema,
    dockingRunId: identifierSchema,
    representativePoseIds: z.array(identifierSchema).min(1),
    method: identifierSchema,
  })
  .strict();
const interactionsData = z
  .object({
    dockingRunId: identifierSchema,
    interactions: z.array(
      z
        .object({
          poseId: identifierSchema,
          interactionType: z.enum(['HYDROGEN_BOND', 'HYDROPHOBIC', 'IONIC', 'FIXTURE_CONTACT']),
          residueRef: identifierSchema,
          distanceAngstrom: z.number().finite().positive(),
        })
        .strict(),
    ),
    provenance: connectorProvenanceSchema,
  })
  .strict();

@ControllerDecorator()
export class DockingController {
  private runtime: LiveToolRuntime = defaultLiveToolRuntime;
  private runtimeInjected = false;

  useRuntime(runtime: LiveToolRuntime): this {
    this.runtime = runtime;
    this.runtimeInjected = true;
    return this;
  }

  @Tool({
    name: 'prepare_receptor',
    description:
      'Prepare real receptor PDBQT bytes with Meeko from supplied PDB coordinates, or return an explicit fixture reference.',
    inputSchema: prepareReceptorInput,
    examples: {
      request: {
        runId: 'run-1',
        structureId: 'fixture-structure-1',
        chainIds: ['A'],
        preparationMethod: 'fixture-receptor-preparation',
      },
      response: failureExample('prepare_receptor'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'docking', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  prepareReceptor(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'prepare_receptor',
      input,
      inputSchema: prepareReceptorInput,
      dataSchema: prepareReceptorData,
      context,
      operation: async (value) => {
        const environment = loadMcpEnvironment();
        if (value.preparationMethod === 'meeko') {
          if (!environment.MEEKO_ENABLED && !this.runtimeInjected) {
            throw new ToolExecutionError('MEEKO_NOT_CONFIGURED', 'CONNECTOR', 'Meeko receptor preparation is not enabled.');
          }
          if (!value.structurePdbBase64) {
            throw new ToolExecutionError('STRUCTURE_PDB_REQUIRED', 'VALIDATION', 'Meeko requires actual PDB bytes.');
          }
          const pdb = Buffer.from(selectReceptorChains(
            Buffer.from(value.structurePdbBase64, 'base64').toString('utf8'),
            value.chainIds,
          ));
          const directory = await mkdtemp(join(tmpdir(), 'immunograph-receptor-'));
          try {
            const inputPath = join(directory, 'receptor.pdb');
            const outputPath = join(directory, 'receptor.pdbqt');
            await writeFile(inputPath, pdb);
            const script = fileURLToPath(new URL('../../../scripts/live/prepare_receptor.py', import.meta.url));
            await this.runtime.runCommand(environment.MEEKO_PYTHON_COMMAND, [script, inputPath, outputPath]);
            const prepared = await readFile(outputPath);
            decodePdbqt(prepared.toString('base64'), 'receptor');
            return {
              receptorId: `${value.structureId}-receptor`,
              structureId: value.structureId,
              artifactRef: `mcp://receptors/${value.runId}/${value.structureId}.pdbqt`,
              artifact: inlineArtifact(
                `${value.runId}-${value.structureId}-receptor`,
                'receptor.pdbqt',
                'chemical/x-pdbqt',
                `mcp://receptors/${value.runId}/${value.structureId}.pdbqt`,
                prepared,
              ),
              format: 'PDBQT' as const,
              sourceStatus: 'LIVE' as const,
              scientificUse: true,
              provenance: provenance('meeko', 'prepare_receptor', 'LIVE', {
                structureId: value.structureId,
                chainIds: value.chainIds,
                inputSha256: createHash('sha256').update(pdb).digest('hex'),
              }),
            };
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
        }
        if (value.preparationMethod !== 'fixture-receptor-preparation') {
          throw new ToolExecutionError('RECEPTOR_METHOD_UNSUPPORTED', 'VALIDATION', 'Use meeko or explicit fixture preparation.');
        }
        return {
          receptorId: `${value.structureId}-receptor`,
          structureId: value.structureId,
          artifactRef: `mcp://receptors/${value.runId}/${value.structureId}`,
          format: 'FIXTURE_JSON' as const,
          sourceStatus: 'FIXTURE' as const,
          scientificUse: false,
          provenance: provenance('receptor-preparer', value.preparationMethod, 'FIXTURE', value),
        };
      },
    });
  }

  @Tool({
    name: 'validate_docking_box',
    description: 'Validate docking box dimensions before docking execution.',
    inputSchema: dockingBoxInput,
    examples: {
      request: {
        runId: 'run-1',
        dockingBoxId: 'fixture-box-1',
        center: { x: 0, y: 0, z: 0 },
        size: { x: 18, y: 18, z: 18 },
      },
      response: failureExample('validate_docking_box'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'docking', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  validateDockingBox(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'validate_docking_box',
      input,
      inputSchema: dockingBoxInput,
      dataSchema: dockingBoxData,
      context,
      operation: (value) => {
        const volume = value.size.x * value.size.y * value.size.z;
        return {
          dockingBoxId: value.dockingBoxId,
          valid: volume > 0 && volume <= 27_000,
          volume,
          warnings: volume > 27_000 ? ['docking-box-too-large'] : [],
          provenance: provenance('docking-box-validator', 'validate_docking_box', 'FIXTURE', value),
        };
      },
    });
  }

  @Tool({
    name: 'run_docking',
    description: 'Run AutoDock Vina on supplied PDBQT bytes and export real 3D poses, viewer HTML, and ZIP, or replay an explicit fixture.',
    inputSchema: runDockingInput,
    examples: {
      request: {
        runId: 'run-1',
        receptorId: 'fixture-receptor-1',
        ligandId: 'fixture-ligand-1',
        dockingBoxId: 'fixture-box-1',
        mode: 'FIXTURE',
        fallbackPolicy: 'FIXTURE_ONLY',
      },
      response: failureExample('run_docking'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'docking', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  runDocking(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'run_docking',
      input,
      inputSchema: runDockingInput,
      dataSchema: runDockingData,
      context,
      operation: async (value) => {
        if (value.mode === 'VINA') {
          return this.runVinaDocking(value);
        }
        const status: z.infer<typeof sourceStatus> = 'FIXTURE';
        const dockingRunId = `${value.receptorId}-${value.ligandId}-${value.dockingBoxId}`;
        return {
          dockingRun: {
            dockingRunId,
            receptorId: value.receptorId,
            ligandId: value.ligandId,
            dockingBoxId: value.dockingBoxId,
            sourceStatus: status,
            scientificUse: false,
          },
          poses: fixturePoses(dockingRunId),
          provenance: provenance('docking-fixture-adapter', 'run_docking', status, value),
        };
      },
    });
  }

  private async runVinaDocking(value: z.infer<typeof runDockingInput>) {
    const environment = loadMcpEnvironment();
    if (!environment.VINA_ENABLED && !this.runtimeInjected) {
      throw dockingUnavailable(value.fallbackPolicy);
    }
    if (!value.receptorPdbqtBase64 || !value.ligandPdbqtBase64 || !value.box) {
      throw new ToolExecutionError(
        'VINA_INPUT_FILES_REQUIRED',
        'VALIDATION',
        'Vina mode requires receptor and ligand PDBQT bytes plus a docking box.',
      );
    }
    const receptorPdbqt = decodePdbqt(value.receptorPdbqtBase64, 'receptor');
    const ligandPdbqt = decodePdbqt(value.ligandPdbqtBase64, 'ligand');
    const command = process.env.VINA_COMMAND ?? 'vina';
    const dockingRunId = `${value.receptorId}-${value.ligandId}-${value.dockingBoxId}`;
    const directory = await mkdtemp(join(tmpdir(), 'immunograph-vina-'));
    try {
      const receptorPath = join(directory, 'receptor.pdbqt');
      const ligandPath = join(directory, 'ligand.pdbqt');
      const posePath = join(directory, 'poses.pdbqt');
      await Promise.all([
        writeFile(receptorPath, receptorPdbqt),
        writeFile(ligandPath, ligandPdbqt),
      ]);
      const result = await this.runtime.runCommand(command, [
        '--receptor', receptorPath,
        '--ligand', ligandPath,
        '--center_x', String(value.box.center.x),
        '--center_y', String(value.box.center.y),
        '--center_z', String(value.box.center.z),
        '--size_x', String(value.box.size.x),
        '--size_y', String(value.box.size.y),
        '--size_z', String(value.box.size.z),
        '--exhaustiveness', String(value.exhaustiveness),
        '--num_modes', String(value.numModes),
        '--cpu', String(value.cpu),
        '--seed', String(value.seed),
        '--out', posePath,
      ]);
      const posePdbqt = await readFile(posePath, 'utf8');
      const poses = parseVinaPoseFile(dockingRunId, posePdbqt);
      if (poses.length === 0) {
        throw new ToolExecutionError('VINA_OUTPUT_INVALID', 'CONNECTOR', 'Vina produced no parseable 3D poses.');
      }
      const receptorPdb = pdbFromPdbqt(receptorPdbqt);
      const topPosePdb = pdbFromPdbqt(firstPdbqtModel(posePdbqt));
      const viewerHtml = dockingViewerHtml(dockingRunId, receptorPdb, topPosePdb);
      const log = `${result.stdout}\n${result.stderr}`;
      const files = [
        { path: 'receptor.pdbqt', data: Buffer.from(receptorPdbqt) },
        { path: 'ligand.pdbqt', data: Buffer.from(ligandPdbqt) },
        { path: 'poses.pdbqt', data: Buffer.from(posePdbqt) },
        { path: 'receptor.pdb', data: Buffer.from(receptorPdb) },
        { path: 'top_pose.pdb', data: Buffer.from(topPosePdb) },
        { path: 'viewer.html', data: Buffer.from(viewerHtml) },
        { path: 'vina.log', data: Buffer.from(log) },
        { path: 'box.json', data: Buffer.from(JSON.stringify(value.box, null, 2)) },
      ];
      const bundle = buildStoredZip(files);
      return {
        dockingRun: {
          dockingRunId,
          receptorId: value.receptorId,
          ligandId: value.ligandId,
          dockingBoxId: value.dockingBoxId,
          sourceStatus: 'LIVE' as const,
          scientificUse: true,
        },
        poses,
        artifacts: [
          inlineArtifact(`${dockingRunId}-poses`, 'poses.pdbqt', 'chemical/x-pdbqt', `mcp://docking/${value.runId}/poses.pdbqt`, posePdbqt),
          inlineArtifact(`${dockingRunId}-viewer`, 'viewer.html', 'text/html', `mcp://docking/${value.runId}/viewer.html`, viewerHtml),
          inlineArtifact(`${dockingRunId}-bundle`, 'docking-bundle.zip', 'application/zip', `mcp://docking/${value.runId}/docking-bundle.zip`, bundle),
        ],
        provenance: provenance('autodock-vina', 'run_docking', 'LIVE', {
          runId: value.runId,
          receptorId: value.receptorId,
          ligandId: value.ligandId,
          box: value.box,
          seed: value.seed,
          exhaustiveness: value.exhaustiveness,
          numModes: value.numModes,
          receptorSha256: createHash('sha256').update(receptorPdbqt).digest('hex'),
          ligandSha256: createHash('sha256').update(ligandPdbqt).digest('hex'),
        }),
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  @Tool({
    name: 'cluster_docking_poses',
    description: 'Cluster docking poses from structured docking output.',
    inputSchema: clusterInput,
    examples: {
      request: {
        runId: 'run-1',
        dockingRunId: 'fixture-docking-run-1',
        method: 'FIXTURE',
        poses: fixturePoses('fixture-docking-run-1'),
      },
      response: failureExample('cluster_docking_poses'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'docking', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  clusterDockingPoses(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'cluster_docking_poses',
      input,
      inputSchema: clusterInput,
      dataSchema: clusterData,
      context,
      operation: (value) => ({
        dockingRunId: value.dockingRunId,
        clusters: [
          {
            clusterId: `${value.dockingRunId}-cluster-1`,
            poseIds: value.poses.map((pose) => pose.poseId),
            representativePoseId: value.poses[0]?.poseId ?? `${value.dockingRunId}-pose-1`,
            stabilityScore: Math.min(1, value.poses.length / 3),
          },
        ],
        outlierPoseIds: [],
        provenance: provenance('docking-clusterer', value.method, 'FIXTURE', value),
      }),
    });
  }

  @Tool({
    name: 'extract_interactions',
    description: 'Replay fixture interactions; live PLIP extraction currently fails until complex input and parsing are implemented.',
    inputSchema: interactionsInput,
    examples: {
      request: {
        runId: 'run-1',
        dockingRunId: 'fixture-docking-run-1',
        representativePoseIds: ['fixture-docking-run-1-pose-1'],
        method: 'fixture-interaction-extraction',
      },
      response: failureExample('extract_interactions'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'docking', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  extractInteractions(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'extract_interactions',
      input,
      inputSchema: interactionsInput,
      dataSchema: interactionsData,
      context,
      operation: async (value) => {
        const environment = loadMcpEnvironment();
        if (environment.PLIP_ENABLED || this.runtimeInjected) {
          throw new ToolExecutionError(
            'PLIP_INPUT_AND_PARSER_REQUIRED', 'CONNECTOR',
            'Live interaction extraction requires a protein-ligand complex file and parsed PLIP output; no interactions were fabricated.',
          );
        }
        return {
          dockingRunId: value.dockingRunId,
          interactions: value.representativePoseIds.map((poseId, index) => ({
            poseId,
            interactionType: 'FIXTURE_CONTACT' as const,
            residueRef: `A:${index + 1}`,
            distanceAngstrom: 3.2 + index * 0.1,
          })),
          provenance: provenance('interaction-extractor', value.method, 'FIXTURE', value),
        };
      },
    });
  }
}

function fixturePoses(dockingRunId: string) {
  return [1, 2, 3].map((rank) => ({
    poseId: `${dockingRunId}-pose-${rank}`,
    rank,
    affinityKcalMol: -6.5 + rank * 0.2,
    rmsdLowerBound: rank === 1 ? 0 : rank * 0.5,
    rmsdUpperBound: rank === 1 ? 0 : rank * 0.8,
  }));
}

function dockingUnavailable(policy: z.infer<typeof fallbackPolicy>): ToolExecutionError {
  return new ToolExecutionError(
    'DOCKING_RUNTIME_UNAVAILABLE',
    'CONNECTOR',
    'Live docking execution is not configured for this MCP deployment.',
    true,
    { policy },
  );
}

function decodePdbqt(encoded: string, role: string): string {
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000) {
    throw new ToolExecutionError('PDBQT_SIZE_INVALID', 'VALIDATION', `${role} PDBQT size is invalid.`);
  }
  const text = bytes.toString('utf8');
  const atomLine = text.split(/\r?\n/u).find((line) => line.startsWith('ATOM  ') || line.startsWith('HETATM'));
  if (!atomLine || ![30, 38, 46].every((start) => Number.isFinite(Number(atomLine.slice(start, start + 8))))) {
    throw new ToolExecutionError('PDBQT_INVALID', 'VALIDATION', `${role} PDBQT has no valid 3D atom coordinates.`);
  }
  return text;
}

function selectReceptorChains(pdb: string, chainIds: string[]): string {
  const allowed = new Set(chainIds);
  const atoms = pdb.split(/\r?\n/u).filter((line) =>
    line.startsWith('ATOM  ') && allowed.has(line[21] ?? ''),
  );
  if (atoms.length === 0) {
    throw new ToolExecutionError('STRUCTURE_PDB_INVALID', 'VALIDATION', 'No protein atom records match the selected chains.');
  }
  return `${atoms.join('\n')}\nEND\n`;
}

function parseVinaPoseFile(dockingRunId: string, contents: string) {
  if (!contents.includes('MODEL') || !contents.includes('ATOM')) return [];
  return [...contents.matchAll(/^REMARK VINA RESULT:\s*(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gmu)]
    .map((match, index) => ({
      poseId: `${dockingRunId}-pose-${index + 1}`,
      rank: index + 1,
      affinityKcalMol: Number(match[1]),
      rmsdLowerBound: Number(match[2]),
      rmsdUpperBound: Number(match[3]),
    }));
}

function firstPdbqtModel(contents: string): string {
  const start = contents.indexOf('MODEL ');
  if (start < 0) return contents;
  const end = contents.indexOf('ENDMDL', start);
  return contents.slice(start, end < 0 ? undefined : end);
}

function pdbFromPdbqt(contents: string): string {
  const atoms = contents.split(/\r?\n/u)
    .filter((line) => line.startsWith('ATOM  ') || line.startsWith('HETATM'))
    .map((line) => line.slice(0, 66));
  if (atoms.length === 0) throw new ToolExecutionError('PDBQT_INVALID', 'CONNECTOR', 'No 3D atoms found for viewer export.');
  return `${atoms.join('\n')}\nEND\n`;
}

function dockingViewerHtml(runId: string, receptorPdb: string, ligandPdb: string): string {
  const safe = (value: string) => JSON.stringify(value).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ImmunoGraph docking ${runId.replaceAll(/[<>&"']/g, '')}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.0.1/3Dmol-min.js"></script>
<style>body{margin:0;font:14px system-ui;background:#101820;color:#fff}header{padding:12px 18px}#viewer{height:calc(100vh - 75px);width:100%}</style>
</head><body><header>Docking run: ${runId.replaceAll(/[<>&"']/g, '')} · receptor (blue) · top pose (green)</header>
<div id="viewer"></div><script>
const viewer = $3Dmol.createViewer(document.getElementById('viewer'), {backgroundColor:'#101820'});
viewer.addModel(${safe(receptorPdb)}, 'pdb');
viewer.setStyle({model:0}, {cartoon:{color:'#65a9e8'}});
viewer.addModel(${safe(ligandPdb)}, 'pdb');
viewer.setStyle({model:1}, {stick:{colorscheme:'greenCarbon',radius:0.18}});
viewer.zoomTo({model:1}); viewer.render();
</script></body></html>`;
}

function provenance(
  connectorId: string,
  method: string,
  status: 'LIVE' | 'CACHED' | 'FIXTURE',
  parameters: unknown,
) {
  return {
    connectorId,
    connectorVersion: '1.0.0',
    method,
    methodVersion: '1.0.0',
    status,
    sourceUri: `https://immunograph.local/${connectorId}`,
    parameters: parameters as Record<string, unknown>,
    predictionSource: status,
    scientificUse: status === 'LIVE',
    validationStatus: status === 'LIVE' ? 'SCIENTIFIC' : 'VERIFIED_FIXTURE',
    algorithm: connectorId,
    algorithmVersion: '1.0.0',
    datasetHash: canonicalJsonSha256({ connectorId, method, status }),
  } as const;
}
