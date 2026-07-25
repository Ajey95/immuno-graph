import { canonicalJsonSha256 } from '@immunograph/algorithms';
import { ControllerDecorator, ToolDecorator as Tool } from '@nitrostack/core';
import type { ExecutionContext } from '@nitrostack/core';
import { z } from 'zod';

import {
  connectorProvenanceSchema,
  failureExample,
  identifierSchema,
  unitIntervalSchema,
} from '../common/contracts.js';
import { executeTool, ToolExecutionError } from '../common/executor.js';

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
  })
  .strict();
const prepareReceptorData = z
  .object({
    receptorId: identifierSchema,
    structureId: identifierSchema,
    artifactRef: identifierSchema,
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
  @Tool({
    name: 'prepare_receptor',
    description:
      'Prepare receptor artifact references for docking through local tools or fixture fallback.',
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
      operation: (value) => ({
        receptorId: `${value.structureId}-receptor`,
        structureId: value.structureId,
        artifactRef: `mcp://receptors/${value.runId}/${value.structureId}`,
        format: 'FIXTURE_JSON' as const,
        sourceStatus: 'FIXTURE' as const,
        scientificUse: false,
        provenance: provenance('receptor-preparer', value.preparationMethod, 'FIXTURE', value),
      }),
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
    description: 'Run configured docking or replay an approved deterministic docking fixture.',
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
      operation: (value) => {
        const status: z.infer<typeof sourceStatus> =
          value.mode === 'FIXTURE' ? 'FIXTURE' : fallbackStatus(value.fallbackPolicy);
        const dockingRunId = `${value.receptorId}-${value.ligandId}-${value.dockingBoxId}`;
        return {
          dockingRun: {
            dockingRunId,
            receptorId: value.receptorId,
            ligandId: value.ligandId,
            dockingBoxId: value.dockingBoxId,
            sourceStatus: status,
            scientificUse: status === 'LIVE',
          },
          poses: fixturePoses(dockingRunId),
          provenance: provenance('docking-fixture-adapter', 'run_docking', status, value),
        };
      },
    });
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
    description: 'Extract interaction summaries from representative docking poses.',
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
      operation: (value) => ({
        dockingRunId: value.dockingRunId,
        interactions: value.representativePoseIds.map((poseId, index) => ({
          poseId,
          interactionType: 'FIXTURE_CONTACT' as const,
          residueRef: `A:${index + 1}`,
          distanceAngstrom: 3.2 + index * 0.1,
        })),
        provenance: provenance('interaction-extractor', value.method, 'FIXTURE', value),
      }),
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

function fallbackStatus(policy: z.infer<typeof fallbackPolicy>): z.infer<typeof sourceStatus> {
  if (policy === 'LIVE_ONLY' || policy === 'CACHE_THEN_LIVE') {
    throw new ToolExecutionError(
      'DOCKING_RUNTIME_UNAVAILABLE',
      'CONNECTOR',
      'Live docking execution is not configured for this MCP deployment.',
      true,
      { policy },
    );
  }
  return 'FIXTURE';
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
