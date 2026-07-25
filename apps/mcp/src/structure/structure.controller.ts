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

const CATEGORY = 'Structure Tools';
const sourceStatus = z.enum(['LIVE', 'CACHED', 'FIXTURE']);
const fallbackPolicy = z.enum([
  'LIVE_ONLY',
  'CACHE_THEN_LIVE',
  'CACHE_THEN_LIVE_THEN_FIXTURE',
  'LIVE_THEN_CACHE_THEN_FIXTURE',
  'FIXTURE_ONLY',
]);

const fetchStructureInput = z
  .object({
    runId: identifierSchema,
    targetId: identifierSchema,
    source: z.enum(['RCSB_PDB', 'ALPHAFOLD_DB', 'FIXTURE']),
    accession: identifierSchema,
    fallbackPolicy,
  })
  .strict();
const structureRecord = z
  .object({
    structureId: identifierSchema,
    targetId: identifierSchema,
    source: z.enum(['RCSB_PDB', 'ALPHAFOLD_DB', 'FIXTURE']),
    accession: identifierSchema,
    sourceStatus,
    format: z.enum(['PDB', 'MMCIF', 'PAE_JSON', 'FIXTURE_JSON']),
    chainIds: z.array(identifierSchema),
    artifactRef: identifierSchema,
    scientificUse: z.boolean(),
    validationStatus: z.enum(['SCIENTIFIC', 'DEMONSTRATION_ONLY', 'VERIFIED_FIXTURE']),
  })
  .strict();
const fetchStructureData = z
  .object({ structure: structureRecord, provenance: connectorProvenanceSchema })
  .strict();

const validateStructureInput = z
  .object({
    runId: identifierSchema,
    structureId: identifierSchema,
    format: z.enum(['PDB', 'MMCIF', 'PAE_JSON', 'FIXTURE_JSON']),
    chainIds: z.array(identifierSchema).min(1),
    residueCount: z.number().int().positive(),
    sourceStatus,
  })
  .strict();
const validateStructureData = z
  .object({
    structureId: identifierSchema,
    valid: z.boolean(),
    warnings: z.array(identifierSchema),
    checks: z.array(
      z
        .object({
          checkId: identifierSchema,
          status: z.enum(['PASS', 'WARN', 'FAIL']),
          message: identifierSchema,
        })
        .strict(),
    ),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const epitopeMappingInput = z
  .object({
    runId: identifierSchema,
    structureId: identifierSchema,
    candidates: z
      .array(
        z
          .object({
            candidateId: identifierSchema,
            start: z.number().int().positive(),
            end: z.number().int().positive(),
            chainId: identifierSchema.optional(),
          })
          .strict(),
      )
      .min(1),
    mappingMode: z.enum(['DIRECT_COORDINATE', 'FIXTURE']),
  })
  .strict();
const epitopeMappingData = z
  .object({
    mappings: z.array(
      z
        .object({
          candidateId: identifierSchema,
          structureId: identifierSchema,
          chainId: identifierSchema,
          start: z.number().int().positive(),
          end: z.number().int().positive(),
          status: z.enum(['MAPPED', 'UNMAPPED']),
          confidence: unitIntervalSchema,
        })
        .strict(),
    ),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const accessibilityInput = z
  .object({
    runId: identifierSchema,
    method: identifierSchema,
    mappings: z
      .array(
        z
          .object({
            candidateId: identifierSchema,
            structureId: identifierSchema,
            chainId: identifierSchema,
            start: z.number().int().positive(),
            end: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
const accessibilityData = z
  .object({
    accessibility: z.array(
      z
        .object({
          candidateId: identifierSchema,
          surfaceAccessibility: unitIntervalSchema,
          method: identifierSchema,
          status: z.enum(['FIXTURE', 'CALCULATED']),
        })
        .strict(),
    ),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const confidenceInput = z
  .object({
    runId: identifierSchema,
    structureId: identifierSchema,
    sourceStatus,
    confidenceMetrics: z.record(z.number().finite()).optional(),
  })
  .strict();
const confidenceData = z
  .object({
    structureId: identifierSchema,
    confidenceScore: unitIntervalSchema,
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    warnings: z.array(identifierSchema),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const exampleFetch = {
  runId: 'run-1',
  targetId: 'target-1',
  source: 'FIXTURE' as const,
  accession: 'fixture-structure-1',
  fallbackPolicy: 'FIXTURE_ONLY' as const,
};

@ControllerDecorator()
export class StructureController {
  @Tool({
    name: 'fetch_structure',
    description: 'Fetch or replay a structure record with explicit source provenance.',
    inputSchema: fetchStructureInput,
    examples: { request: exampleFetch, response: failureExample('fetch_structure') },
    metadata: { category: CATEGORY, tags: ['immunograph', 'structure', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  fetchStructure(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'fetch_structure',
      input,
      inputSchema: fetchStructureInput,
      dataSchema: fetchStructureData,
      context,
      operation: (value) => {
        const status: z.infer<typeof sourceStatus> =
          value.source === 'FIXTURE' ? 'FIXTURE' : fallbackStatus(value.fallbackPolicy);
        return {
          structure: {
            structureId: `${value.targetId}-${value.accession}`,
            targetId: value.targetId,
            source: value.source,
            accession: value.accession,
            sourceStatus: status,
            format: 'FIXTURE_JSON' as const,
            chainIds: ['A'],
            artifactRef: `mcp://structures/${value.runId}/${value.accession}`,
            scientificUse: status === 'LIVE',
            validationStatus:
              status === 'LIVE' ? ('SCIENTIFIC' as const) : ('VERIFIED_FIXTURE' as const),
          },
          provenance: provenance('structure-fixture-adapter', 'fetch_structure', status, value),
        };
      },
    });
  }

  @Tool({
    name: 'validate_structure',
    description: 'Validate structure metadata before mapping or docking preparation.',
    inputSchema: validateStructureInput,
    examples: {
      request: {
        runId: 'run-1',
        structureId: 'fixture-structure-1',
        format: 'FIXTURE_JSON',
        chainIds: ['A'],
        residueCount: 100,
        sourceStatus: 'FIXTURE',
      },
      response: failureExample('validate_structure'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'structure', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  validateStructure(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'validate_structure',
      input,
      inputSchema: validateStructureInput,
      dataSchema: validateStructureData,
      context,
      operation: (value) => ({
        structureId: value.structureId,
        valid: value.residueCount > 0 && value.chainIds.length > 0,
        warnings: value.sourceStatus === 'FIXTURE' ? ['fixture-structure-not-live'] : [],
        checks: [
          {
            checkId: 'STRUCTURE-CHAIN-001',
            status: 'PASS' as const,
            message: 'At least one chain is present.',
          },
          {
            checkId: 'STRUCTURE-RESIDUE-001',
            status: 'PASS' as const,
            message: 'Residue count is positive.',
          },
        ],
        provenance: provenance(
          'structure-validator',
          'validate_structure',
          value.sourceStatus,
          value,
        ),
      }),
    });
  }

  @Tool({
    name: 'map_epitopes_to_structure',
    description: 'Map epitope candidate coordinates to a validated structure reference.',
    inputSchema: epitopeMappingInput,
    examples: {
      request: {
        runId: 'run-1',
        structureId: 'fixture-structure-1',
        candidates: [{ candidateId: 'candidate-1', start: 1, end: 9 }],
        mappingMode: 'FIXTURE',
      },
      response: failureExample('map_epitopes_to_structure'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'structure', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  mapEpitopes(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'map_epitopes_to_structure',
      input,
      inputSchema: epitopeMappingInput,
      dataSchema: epitopeMappingData,
      context,
      operation: (value) => ({
        mappings: value.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          structureId: value.structureId,
          chainId: candidate.chainId ?? 'A',
          start: candidate.start,
          end: candidate.end,
          status: 'MAPPED' as const,
          confidence: value.mappingMode === 'FIXTURE' ? 0.7 : 0.85,
        })),
        provenance: provenance('structure-mapper', 'map_epitopes_to_structure', 'FIXTURE', value),
      }),
    });
  }

  @Tool({
    name: 'calculate_surface_accessibility',
    description: 'Calculate fixture-safe surface accessibility summaries for mapped candidates.',
    inputSchema: accessibilityInput,
    examples: {
      request: {
        runId: 'run-1',
        method: 'fixture-accessibility',
        mappings: [
          {
            candidateId: 'candidate-1',
            structureId: 'fixture-structure-1',
            chainId: 'A',
            start: 1,
            end: 9,
          },
        ],
      },
      response: failureExample('calculate_surface_accessibility'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'structure', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  calculateSurfaceAccessibility(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'calculate_surface_accessibility',
      input,
      inputSchema: accessibilityInput,
      dataSchema: accessibilityData,
      context,
      operation: (value) => ({
        accessibility: value.mappings.map((mapping) => ({
          candidateId: mapping.candidateId,
          surfaceAccessibility: stableUnitInterval(mapping),
          method: value.method,
          status: 'FIXTURE' as const,
        })),
        provenance: provenance('structure-accessibility', value.method, 'FIXTURE', value),
      }),
    });
  }

  @Tool({
    name: 'calculate_structure_confidence',
    description: 'Calculate structure confidence from provided metrics or fixture-safe defaults.',
    inputSchema: confidenceInput,
    examples: {
      request: { runId: 'run-1', structureId: 'fixture-structure-1', sourceStatus: 'FIXTURE' },
      response: failureExample('calculate_structure_confidence'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'structure', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  calculateStructureConfidence(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'calculate_structure_confidence',
      input,
      inputSchema: confidenceInput,
      dataSchema: confidenceData,
      context,
      operation: (value) => {
        const metricValues = Object.values(value.confidenceMetrics ?? {});
        const score =
          metricValues.length === 0
            ? 0.65
            : Math.max(
                0,
                Math.min(
                  1,
                  metricValues.reduce((sum, item) => sum + item, 0) / metricValues.length,
                ),
              );
        return {
          structureId: value.structureId,
          confidenceScore: score,
          confidence:
            score >= 0.8
              ? ('HIGH' as const)
              : score >= 0.5
                ? ('MEDIUM' as const)
                : ('LOW' as const),
          warnings: value.sourceStatus === 'FIXTURE' ? ['fixture-confidence-not-live'] : [],
          provenance: provenance(
            'structure-confidence',
            'calculate_structure_confidence',
            value.sourceStatus,
            value,
          ),
        };
      },
    });
  }
}

function fallbackStatus(policy: z.infer<typeof fallbackPolicy>): z.infer<typeof sourceStatus> {
  if (policy === 'LIVE_ONLY' || policy === 'CACHE_THEN_LIVE') {
    throw new ToolExecutionError(
      'STRUCTURE_LIVE_CONNECTOR_UNAVAILABLE',
      'CONNECTOR',
      'Live structure retrieval is not configured for this MCP deployment.',
      true,
      { policy },
    );
  }
  return 'FIXTURE';
}

function stableUnitInterval(value: unknown): number {
  const hash = canonicalJsonSha256(value as never);
  return Number.parseInt(hash.slice(0, 8), 16) / 0xffffffff;
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
  } as const;
}
