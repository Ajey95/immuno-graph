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
import { loadMcpEnvironment } from '../config/environment.js';

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
    artifact: inlineArtifactSchema.optional(),
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
    structurePdbBase64: z.string().min(1).max(8_000_000).optional(),
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
    referenceSequence: z.string().regex(/^[A-Za-z]+$/u).optional(),
    structurePdbBase64: z.string().min(1).max(8_000_000).optional(),
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
    structurePdbBase64: z.string().min(1).max(8_000_000).optional(),
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
    artifacts: z.array(inlineArtifactSchema).optional(),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const confidenceInput = z
  .object({
    runId: identifierSchema,
    structureId: identifierSchema,
    sourceStatus,
    confidenceMetrics: z.record(z.string(), z.number().finite()).optional(),
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

const pocketInput = z
  .object({
    runId: identifierSchema,
    structureId: identifierSchema,
    structureArtifactRef: identifierSchema,
    method: z.enum(['fpocket', 'fixture-pocket-detector']),
    structurePdbBase64: z.string().min(1).max(8_000_000).optional(),
  })
  .strict();
const pocketData = z
  .object({
    pockets: z.array(
      z
        .object({
          pocketId: identifierSchema,
          structureId: identifierSchema,
          score: z.number().finite(),
          druggabilityScore: unitIntervalSchema,
          center: z
            .object({
              x: z.number().finite(),
              y: z.number().finite(),
              z: z.number().finite(),
            })
            .strict(),
          sourceStatus,
        })
        .strict(),
    ),
    artifacts: z.array(inlineArtifactSchema).optional(),
    provenance: connectorProvenanceSchema,
  })
  .strict();

const molstarInput = z
  .object({
    runId: identifierSchema,
    viewId: identifierSchema,
    structureArtifactRef: identifierSchema,
    ligandArtifactRef: identifierSchema.optional(),
    mode: z.enum(['STRUCTURE', 'DOCKING']),
    structurePdbBase64: z.string().min(1).max(8_000_000).optional(),
    ligandPdbBase64: z.string().min(1).max(8_000_000).optional(),
  })
  .strict();
const molstarData = z
  .object({
    viewer: z
      .object({
        viewId: identifierSchema,
        viewer: z.literal('Mol*'),
        stateRef: identifierSchema,
        structureArtifactRef: identifierSchema,
        ligandArtifactRef: identifierSchema.optional(),
        mode: z.enum(['STRUCTURE', 'DOCKING']),
        sourceStatus,
        scientificUse: z.boolean(),
      })
      .strict(),
    artifact: inlineArtifactSchema.optional(),
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
  private runtime: LiveToolRuntime = defaultLiveToolRuntime;
  private runtimeInjected = false;

  useRuntime(runtime: LiveToolRuntime): this {
    this.runtime = runtime;
    this.runtimeInjected = true;
    return this;
  }

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
      operation: async (value) => {
        if (value.source !== 'FIXTURE') {
          try {
            const live = await this.fetchLiveStructure(
              value as z.infer<typeof fetchStructureInput> & {
                source: 'RCSB_PDB' | 'ALPHAFOLD_DB';
              },
            );
            return live;
          } catch (error) {
            if (!fixtureFallbackAllowed(value.fallbackPolicy)) throw error;
          }
        }
        const status: z.infer<typeof sourceStatus> = 'FIXTURE';
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
            scientificUse: false,
            validationStatus: 'VERIFIED_FIXTURE' as const,
          },
          provenance: provenance('structure-fixture-adapter', 'fetch_structure', status, value),
        };
      },
    });
  }

  private async fetchLiveStructure(
    value: z.infer<typeof fetchStructureInput> & { source: 'RCSB_PDB' | 'ALPHAFOLD_DB' },
  ) {
    const environment = loadMcpEnvironment();
    const enabled =
      value.source === 'RCSB_PDB' ? environment.RCSB_PDB_ENABLED : environment.ALPHAFOLD_DB_ENABLED;
    if (!enabled && !this.runtimeInjected) {
      throw structureUnavailable(value.fallbackPolicy, value.source);
    }
    const urls =
      value.source === 'RCSB_PDB'
        ? [`https://files.rcsb.org/download/${encodeURIComponent(value.accession)}.pdb`]
        : [
            `https://alphafold.ebi.ac.uk/files/AF-${encodeURIComponent(value.accession)}-F1-model_v6.pdb`,
            `https://alphafold.ebi.ac.uk/files/AF-${encodeURIComponent(value.accession)}-F1-model_v4.pdb`,
          ];
    let contents: string | undefined;
    let artifactRef = urls[0] ?? '';
    let lastError: unknown;
    for (const url of urls) {
      try {
        contents = await this.runtime.fetchText(url);
        artifactRef = url;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (contents === undefined) {
      throw lastError instanceof ToolExecutionError
        ? lastError
        : new ToolExecutionError(
            'LIVE_STRUCTURE_FETCH_FAILED',
            'CONNECTOR',
            'Unable to fetch live structure.',
            true,
            { source: value.source, accession: value.accession },
          );
    }
    const chainIds = extractPdbChainIds(contents);
    if (chainIds.length === 0) {
      throw new ToolExecutionError(
        'LIVE_STRUCTURE_INVALID',
        'CONNECTOR',
        'The downloaded structure has no PDB atom records with chain IDs.',
      );
    }
    const connectorId = value.source === 'RCSB_PDB' ? 'rcsb-pdb' : 'alphafold-db';
    return {
      structure: {
        structureId: `${value.targetId}-${value.accession}`,
        targetId: value.targetId,
        source: value.source,
        accession: value.accession,
        sourceStatus: 'LIVE' as const,
        format: 'PDB' as const,
        chainIds,
        artifactRef,
        artifact: inlineArtifact(
          `${value.runId}-${value.accession}-structure`,
          `${value.accession}.pdb`,
          'chemical/x-pdb',
          artifactRef,
          contents,
        ),
        scientificUse: true,
        validationStatus: 'SCIENTIFIC' as const,
      },
      provenance: provenance(connectorId, 'fetch_structure', 'LIVE', value, artifactRef),
    };
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
      operation: (value) => {
        if (value.sourceStatus === 'LIVE') {
          if (value.format !== 'PDB' || !value.structurePdbBase64) {
            throw new ToolExecutionError('STRUCTURE_PDB_REQUIRED', 'VALIDATION', 'Live validation requires actual PDB bytes.');
          }
          const pdb = decodeStructurePdb(value.structurePdbBase64);
          const proteinAtoms = pdb.toString('utf8').split(/\r?\n/u).filter((line) => line.startsWith('ATOM  '));
          const actualChains = new Set(proteinAtoms.map((line) => line[21] ?? ''));
          const residues = new Set(proteinAtoms.map((line) => `${line[21]}:${line.slice(22, 27)}`));
          const chainsPresent = value.chainIds.every((chain) => actualChains.has(chain));
          const countMatches = value.residueCount === residues.size;
          return {
            structureId: value.structureId,
            valid: chainsPresent && countMatches,
            warnings: countMatches ? [] : [`residue-count-mismatch-${residues.size}`],
            checks: [
              { checkId: 'STRUCTURE-CHAIN-001', status: chainsPresent ? 'PASS' as const : 'FAIL' as const, message: chainsPresent ? 'Requested chains are present in PDB atom records.' : 'A requested chain is absent.' },
              { checkId: 'STRUCTURE-RESIDUE-001', status: countMatches ? 'PASS' as const : 'FAIL' as const, message: `Observed ${residues.size} protein residues; supplied ${value.residueCount}.` },
            ],
            provenance: provenance('pdb-structure-validator', 'validate_structure', 'LIVE', {
              pdbSha256: createHash('sha256').update(pdb).digest('hex'), observedResidueCount: residues.size,
            }),
          };
        }
        return {
          structureId: value.structureId,
          valid: value.residueCount > 0 && value.chainIds.length > 0,
          warnings: ['fixture-structure-not-live'],
          checks: [
            { checkId: 'STRUCTURE-CHAIN-001', status: 'PASS' as const, message: 'At least one chain is present.' },
            { checkId: 'STRUCTURE-RESIDUE-001', status: 'PASS' as const, message: 'Residue count is positive.' },
          ],
          provenance: provenance('structure-validator', 'validate_structure', 'FIXTURE', value),
        };
      },
    });
  }

  @Tool({
    name: 'map_epitopes_to_structure',
    description: 'Align a reference sequence to actual PDB coordinates and map candidate residues, or replay an explicit fixture.',
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
      operation: async (value) => {
        if (value.mappingMode === 'DIRECT_COORDINATE') {
          if (!value.referenceSequence || !value.structurePdbBase64) {
            throw new ToolExecutionError('STRUCTURE_MAPPING_INPUT_REQUIRED', 'VALIDATION', 'Direct mapping requires reference sequence and actual PDB bytes.');
          }
          const pdb = decodeStructurePdb(value.structurePdbBase64);
          const directory = await mkdtemp(join(tmpdir(), 'immunograph-map-'));
          try {
            const pdbPath = join(directory, 'structure.pdb');
            const requestPath = join(directory, 'request.json');
            const outputPath = join(directory, 'mapping.json');
            await Promise.all([
              writeFile(pdbPath, pdb),
              writeFile(requestPath, JSON.stringify({ referenceSequence: value.referenceSequence, candidates: value.candidates })),
            ]);
            const environment = loadMcpEnvironment();
            const script = fileURLToPath(new URL('../../../scripts/live/map_structure.py', import.meta.url));
            await this.runtime.runCommand(environment.SCIENTIFIC_PYTHON_COMMAND, [script, pdbPath, requestPath, outputPath]);
            const result = JSON.parse(await readFile(outputPath, 'utf8')) as { mappings: Array<z.infer<typeof epitopeMappingData>['mappings'][number]> };
            return {
              mappings: result.mappings.map((mapping) => ({ ...mapping, structureId: value.structureId })),
              provenance: provenance('biopython-align', 'map_epitopes_to_structure', 'LIVE', {
                structureId: value.structureId,
                pdbSha256: createHash('sha256').update(pdb).digest('hex'),
                referenceSequenceSha256: createHash('sha256').update(value.referenceSequence).digest('hex'),
                candidateCount: value.candidates.length,
              }),
            };
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
        }
        return { mappings: value.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          structureId: value.structureId,
          chainId: candidate.chainId ?? 'A',
          start: candidate.start,
          end: candidate.end,
          status: 'MAPPED' as const,
          confidence: value.mappingMode === 'FIXTURE' ? 0.7 : 0.85,
        })),
        provenance: provenance('structure-mapper', 'map_epitopes_to_structure', 'FIXTURE', value),
        };
      },
    });
  }

  @Tool({
    name: 'calculate_surface_accessibility',
    description: 'Calculate relative solvent accessibility from actual PDB coordinates using FreeSASA, or replay an explicit fixture.',
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
      operation: async (value) => {
        const environment = loadMcpEnvironment();
        if (value.method === 'freesasa') {
          if (!environment.FREESASA_ENABLED && !this.runtimeInjected) {
            throw new ToolExecutionError('FREESASA_NOT_CONFIGURED', 'CONNECTOR', 'FreeSASA is not enabled.');
          }
          if (!value.structurePdbBase64) {
            throw new ToolExecutionError('FREESASA_STRUCTURE_REQUIRED', 'VALIDATION', 'FreeSASA requires actual PDB bytes.');
          }
          const pdb = decodeStructurePdb(value.structurePdbBase64);
          const directory = await mkdtemp(join(tmpdir(), 'immunograph-sasa-'));
          try {
            const pdbPath = join(directory, 'structure.pdb');
            const requestPath = join(directory, 'request.json');
            const outputPath = join(directory, 'accessibility.json');
            await Promise.all([
              writeFile(pdbPath, pdb),
              writeFile(requestPath, JSON.stringify({ mappings: value.mappings })),
            ]);
            const script = fileURLToPath(new URL('../../../scripts/live/calculate_sasa.py', import.meta.url));
            await this.runtime.runCommand(environment.SCIENTIFIC_PYTHON_COMMAND, [script, pdbPath, requestPath, outputPath]);
            const result = JSON.parse(await readFile(outputPath, 'utf8')) as {
              accessibility: Array<{ candidateId: string; surfaceAccessibility: number; method: string; status: 'CALCULATED' }>;
              perResidue: unknown;
            };
            return {
              accessibility: result.accessibility,
              artifacts: [inlineArtifact(`${value.runId}-sasa`, 'sasa-residues.json', 'application/json', `mcp://structure/${value.runId}/sasa-residues.json`, JSON.stringify(result.perResidue))],
              provenance: provenance('freesasa', 'calculate_surface_accessibility', 'LIVE', {
                pdbSha256: createHash('sha256').update(pdb).digest('hex'),
                mappingCount: value.mappings.length,
              }),
            };
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
        }
        if (value.method !== 'fixture-accessibility') {
          throw new ToolExecutionError('ACCESSIBILITY_METHOD_UNSUPPORTED', 'VALIDATION', 'Use freesasa or explicit fixture accessibility.');
        }
        return {
          accessibility: value.mappings.map((mapping) => ({
            candidateId: mapping.candidateId,
            surfaceAccessibility: stableUnitInterval(mapping),
            method: value.method,
            status: 'FIXTURE' as const,
          })),
          provenance: provenance('structure-accessibility', value.method, 'FIXTURE', value),
        };
      },
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
        if (value.sourceStatus === 'LIVE' && Object.keys(value.confidenceMetrics ?? {}).length === 0) {
          throw new ToolExecutionError('CONFIDENCE_METRICS_REQUIRED', 'VALIDATION', 'Live structure confidence requires measured confidence metrics.');
        }
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

  @Tool({
    name: 'detect_binding_pockets',
    description: 'Detect real pockets from supplied PDB coordinates using fpocket, or replay an explicit fixture.',
    inputSchema: pocketInput,
    examples: {
      request: {
        runId: 'run-1',
        structureId: 'fixture-structure-1',
        structureArtifactRef: 'fixture-structure.pdb',
        method: 'fixture-pocket-detector',
      },
      response: failureExample('detect_binding_pockets'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'structure', 'fpocket', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  detectBindingPockets(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'detect_binding_pockets',
      input,
      inputSchema: pocketInput,
      dataSchema: pocketData,
      context,
      operation: async (value) => {
        const environment = loadMcpEnvironment();
        if (value.method === 'fpocket') {
          if (!environment.FPOCKET_ENABLED && !this.runtimeInjected) {
            throw new ToolExecutionError('FPOCKET_NOT_CONFIGURED', 'CONNECTOR', 'fpocket is not enabled.');
          }
          if (!value.structurePdbBase64) {
            throw new ToolExecutionError('FPOCKET_STRUCTURE_REQUIRED', 'VALIDATION', 'fpocket requires actual PDB bytes.');
          }
          const pdb = decodeStructurePdb(value.structurePdbBase64);
          const directory = await mkdtemp(join(tmpdir(), 'immunograph-fpocket-'));
          try {
            const inputPath = join(directory, 'structure.pdb');
            await writeFile(inputPath, pdb);
            if (process.platform === 'win32' && environment.FPOCKET_WSL_DISTRO) {
              await this.runtime.runCommand('wsl.exe', ['-d', environment.FPOCKET_WSL_DISTRO, '--', environment.FPOCKET_COMMAND, '-f', windowsPathToWsl(inputPath)]);
            } else {
              await this.runtime.runCommand(environment.FPOCKET_COMMAND, ['-f', inputPath]);
            }
            const outputDirectory = join(directory, 'structure_out');
            const report = await readFile(join(outputDirectory, 'structure_info.txt'), 'utf8');
            const descriptors = parseFpocketReport(report);
            const pockets = await Promise.all(descriptors.map(async (descriptor) => {
              const vertices = await readFile(join(outputDirectory, 'pockets', `pocket${descriptor.number}_vert.pqr`), 'utf8');
              return {
                pocketId: `${value.structureId}-pocket-${descriptor.number}`,
                structureId: value.structureId,
                score: descriptor.score,
                druggabilityScore: descriptor.druggability,
                center: fpocketCenter(vertices),
                sourceStatus: 'LIVE' as const,
              };
            }));
            if (pockets.length === 0) {
              throw new ToolExecutionError('FPOCKET_NO_POCKETS', 'CONNECTOR', 'fpocket produced no parseable pocket coordinates.');
            }
            return {
              pockets,
              artifacts: [inlineArtifact(`${value.runId}-fpocket-report`, 'fpocket-info.txt', 'text/plain', `mcp://structure/${value.runId}/fpocket-info.txt`, report)],
              provenance: provenance('fpocket', 'detect_binding_pockets', 'LIVE', {
                structureId: value.structureId,
                pdbSha256: createHash('sha256').update(pdb).digest('hex'),
                pocketCount: pockets.length,
              }),
            };
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
        }
        return {
          pockets: [
            {
              pocketId: `${value.structureId}-pocket-1`,
              structureId: value.structureId,
              score: 1,
              druggabilityScore: 0.5,
              center: { x: 0, y: 0, z: 0 },
              sourceStatus: 'FIXTURE' as const,
            },
          ],
          provenance: provenance('fixture-pocket-detector', value.method, 'FIXTURE', value),
        };
      },
    });
  }

  @Tool({
    name: 'create_molstar_view',
    description: 'Export a Mol* HTML viewer with embedded PDB coordinates, or return an explicit fixture reference.',
    inputSchema: molstarInput,
    examples: {
      request: {
        runId: 'run-1',
        viewId: 'view-1',
        structureArtifactRef: 'fixture-structure.pdb',
        ligandArtifactRef: 'fixture-ligand.pdbqt',
        mode: 'DOCKING',
      },
      response: failureExample('create_molstar_view'),
    },
    metadata: { category: CATEGORY, tags: ['immunograph', 'structure', 'molstar', 'prd-v1.1'] },
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  createMolstarView(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: 'create_molstar_view',
      input,
      inputSchema: molstarInput,
      dataSchema: molstarData,
      context,
      operation: (value) => {
        const environment = loadMcpEnvironment();
        if (value.structurePdbBase64) {
          if (!environment.MOLSTAR_ENABLED && !this.runtimeInjected) {
            throw new ToolExecutionError('MOLSTAR_NOT_CONFIGURED', 'CONNECTOR', 'Mol* export is not enabled.');
          }
          const pdb = decodeStructurePdb(value.structurePdbBase64);
          const ligand = value.ligandPdbBase64 ? Buffer.from(value.ligandPdbBase64, 'base64') : undefined;
          if (value.mode === 'DOCKING' && (!ligand || !ligand.toString('utf8').includes('HETATM'))) {
            throw new ToolExecutionError('MOLSTAR_LIGAND_REQUIRED', 'VALIDATION', 'Docking view requires ligand PDB HETATM coordinates.');
          }
          const html = molstarViewerHtml(value.viewId, pdb.toString('utf8'), ligand?.toString('utf8'));
          const stateRef = `mcp://views/${value.runId}/${value.viewId}.html`;
          return {
            viewer: {
              viewId: value.viewId,
              viewer: 'Mol*' as const,
              stateRef,
              structureArtifactRef: value.structureArtifactRef,
              ...(value.ligandArtifactRef ? { ligandArtifactRef: value.ligandArtifactRef } : {}),
              mode: value.mode,
              sourceStatus: 'LIVE' as const,
              scientificUse: true,
            },
            artifact: inlineArtifact(`${value.runId}-${value.viewId}`, `${value.viewId}.html`, 'text/html', stateRef, html),
            provenance: provenance('molstar', 'create_molstar_view', 'LIVE', {
              structureSha256: createHash('sha256').update(pdb).digest('hex'),
              ligandSha256: ligand ? createHash('sha256').update(ligand).digest('hex') : undefined,
              molstarVersion: '5.13.1',
            }),
          };
        }
        if (environment.MOLSTAR_ENABLED || this.runtimeInjected) {
          throw new ToolExecutionError('MOLSTAR_STRUCTURE_REQUIRED', 'VALIDATION', 'Mol* export requires actual structure PDB bytes.');
        }
        return {
          viewer: {
            viewId: value.viewId,
            viewer: 'Mol*' as const,
            stateRef: `molstar://${value.runId}/${value.viewId}`,
            structureArtifactRef: value.structureArtifactRef,
            ...(value.ligandArtifactRef === undefined
              ? {}
              : { ligandArtifactRef: value.ligandArtifactRef }),
            mode: value.mode,
            sourceStatus: 'FIXTURE' as const,
            scientificUse: false,
          },
          provenance: provenance(
            'molstar',
            'create_molstar_view',
            'FIXTURE',
            value,
          ),
        };
      },
    });
  }
}

function structureUnavailable(
  policy: z.infer<typeof fallbackPolicy>,
  source: 'RCSB_PDB' | 'ALPHAFOLD_DB',
): ToolExecutionError {
  return new ToolExecutionError(
    'STRUCTURE_LIVE_CONNECTOR_UNAVAILABLE',
    'CONNECTOR',
    'Live structure retrieval is not configured for this MCP deployment.',
    true,
    { policy, source },
  );
}

function fixtureFallbackAllowed(policy: z.infer<typeof fallbackPolicy>): boolean {
  return policy === 'CACHE_THEN_LIVE_THEN_FIXTURE' || policy === 'LIVE_THEN_CACHE_THEN_FIXTURE';
}

function extractPdbChainIds(contents: string): string[] {
  const ids = new Set<string>();
  for (const line of contents.split(/\r?\n/u)) {
    if ((line.startsWith('ATOM') || line.startsWith('HETATM')) && line.length >= 22) {
      const chainId = line[21]?.trim();
      if (chainId !== undefined && chainId.length > 0) ids.add(chainId);
    }
  }
  return [...ids].sort();
}

function stableUnitInterval(value: unknown): number {
  const hash = canonicalJsonSha256(value as never);
  return Number.parseInt(hash.slice(0, 8), 16) / 0xffffffff;
}

function decodeStructurePdb(encoded: string): Buffer {
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000 || !bytes.toString('utf8').includes('ATOM  ')) {
    throw new ToolExecutionError('STRUCTURE_PDB_INVALID', 'VALIDATION', 'Actual protein PDB atom coordinates are required.');
  }
  return bytes;
}

function molstarViewerHtml(viewId: string, pdb: string, ligand?: string): string {
  const safe = (value: string) => JSON.stringify(value).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ImmunoGraph Mol* ${viewId.replaceAll(/[<>&"']/gu, '')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/molstar@5.13.1/build/viewer/molstar.css">
<script src="https://cdn.jsdelivr.net/npm/molstar@5.13.1/build/viewer/molstar.js"></script>
<style>body{margin:0;background:#101820;color:white;font:14px system-ui}header{padding:10px 16px}#app{position:absolute;top:42px;bottom:0;left:0;right:0}</style>
</head><body><header>ImmunoGraph Mol* · ${viewId.replaceAll(/[<>&"']/gu, '')}</header><div id="app"></div><script>
const structurePdb=${safe(pdb)};
const ligandPdb=${safe(ligand ?? '')};
molstar.Viewer.create('app',{layoutIsExpanded:false,layoutShowControls:true,layoutShowRemoteState:false,layoutShowLog:false})
  .then(async viewer=>{await viewer.loadStructureFromData(structurePdb,'pdb');if(ligandPdb)await viewer.loadStructureFromData(ligandPdb,'pdb');})
  .catch(error=>{document.querySelector('header').textContent='Mol* load failed: '+error.message;});
</script></body></html>`;
}

function windowsPathToWsl(path: string): string {
  const match = /^([A-Za-z]):\\(.*)$/u.exec(path);
  if (!match) throw new ToolExecutionError('FPOCKET_PATH_INVALID', 'VALIDATION', 'WSL fpocket requires a Windows drive path.');
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replaceAll('\\', '/')}`;
}

function parseFpocketReport(report: string): Array<{ number: number; score: number; druggability: number }> {
  return [...report.matchAll(/^Pocket\s+(\d+)\s*:\s*$([\s\S]*?)(?=^Pocket\s+\d+\s*:|$(?![\s\S]))/gmu)]
    .map((match) => ({
      number: Number(match[1]),
      score: Number(/\bScore\s*:\s*(-?\d+(?:\.\d+)?)/u.exec(match[2] ?? '')?.[1]),
      druggability: Number(/\bDruggability Score\s*:\s*(\d+(?:\.\d+)?)/u.exec(match[2] ?? '')?.[1]),
    }))
    .filter((item) => Number.isInteger(item.number) && Number.isFinite(item.score) && Number.isFinite(item.druggability) && item.druggability >= 0 && item.druggability <= 1);
}

function fpocketCenter(vertices: string): { x: number; y: number; z: number } {
  const coordinates = vertices.split(/\r?\n/u)
    .filter((line) => line.startsWith('ATOM  '))
    .map((line) => [Number(line.slice(30, 38)), Number(line.slice(38, 46)), Number(line.slice(46, 54))]);
  if (coordinates.length === 0 || coordinates.some((point) => point.some((axis) => !Number.isFinite(axis)))) {
    throw new ToolExecutionError('FPOCKET_COORDINATES_INVALID', 'CONNECTOR', 'fpocket pocket has no valid alpha sphere coordinates.');
  }
  const average = (axis: number) => coordinates.reduce((sum, point) => sum + point[axis]!, 0) / coordinates.length;
  return { x: average(0), y: average(1), z: average(2) };
}

function provenance(
  connectorId: string,
  method: string,
  status: 'LIVE' | 'CACHED' | 'FIXTURE',
  parameters: unknown,
  sourceUri?: string,
) {
  return {
    connectorId,
    connectorVersion: '1.0.0',
    method,
    methodVersion: '1.0.0',
    status,
    sourceUri: sourceUri ?? `https://immunograph.local/${connectorId}`,
    parameters: parameters as Record<string, unknown>,
    predictionSource: status,
    scientificUse: status === 'LIVE',
    validationStatus: status === 'LIVE' ? 'SCIENTIFIC' : 'VERIFIED_FIXTURE',
    algorithm: connectorId,
    algorithmVersion: '1.0.0',
  } as const;
}
