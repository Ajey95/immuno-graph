import { createHash, randomUUID } from 'node:crypto';

import { validateFasta } from '@immunograph/algorithms';
import { loadProfileVersion } from '@immunograph/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { normalizeRunConfiguration, serializeRunConfiguration } from './json.js';
import type { McpToolGateway, McpToolResult } from './mcp-tool-gateway.js';
import { buildBindingCacheKey } from './prediction-cache.js';
import { ScientificWorkflowService } from './scientific-workflow-service.js';
import type { scientificBindingDataSchema } from './scientific-workflow-contracts.js';
import { createMigratedTestDatabase } from './test-context.test-support.js';
import { UnavailableWorkflowExecutionPort } from './ports.js';
import { DependencyUnavailableError } from './errors.js';

type BindingResult = z.infer<typeof scientificBindingDataSchema>;

const fasta = '>cache-test\nACDEFGHIKLMNPQRSTVWY';
const validatedFasta = (() => {
  const result = validateFasta(fasta);
  if (!result.ok) throw new Error('Invalid test FASTA.');
  return result.value;
})();

const liveBindingResult: BindingResult = {
  observations: [
    {
      observationId: 'obs-live-1',
      candidateRef: 'candidate-live-1',
      candidateType: 'MHCI',
      peptide: 'ACDEFGHIK',
      start: 1,
      end: 9,
      length: 9,
      allele: 'HLA-A*02:01',
      method: 'iedb-recommended',
      methodVersion: '2023.09',
      rawScore: 0.8,
      percentileRank: 0.5,
      rawFields: { parser: 'redacted-test-sample' },
    },
  ],
  provenance: [
    {
      connectorId: 'iedb',
      connectorVersion: 'tools-api-v1',
      method: 'iedb-recommended',
      methodVersion: '2023.09',
      status: 'LIVE',
      sourceUri: 'https://tools-cluster-interface.iedb.org/tools_api/mhci/',
      parameters: { candidateType: 'MHCI', redacted: true },
      predictionSource: 'LIVE',
      scientificUse: true,
      validationStatus: 'SCIENTIFIC',
    },
  ],
};

const runConfiguration = normalizeRunConfiguration({
  requestedExecutionMode: 'AUTO',
  analysis: {
    mhci: {
      enabled: true,
      alleles: ['HLA-A*02:01'],
      peptideLengths: [9],
      methods: ['iedb-recommended'],
    },
    mhcii: { enabled: false, alleles: [], peptideLengths: [], methods: [] },
    bcell: { enabled: false, methods: [] },
  },
  populations: [],
  fallbackPolicy: 'CACHE_THEN_LIVE',
  ruleProfileVersion: 'mvp-v1.0',
  rankingProfileVersion: 'mvp-v1.0',
  outputPreferences: {
    formats: ['JSON', 'CSV'],
    templateVersion: 'research-report-v1',
    includeWorkflowTrace: true,
    includeEvidenceGraph: true,
  },
});

let database!: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  database = await createMigratedTestDatabase();
}, 60_000);

afterAll(async () => {
  await database?.cleanup();
});

describe('scientific workflow prediction cache', () => {
  it('caches successful live binding results and reuses them as CACHED on an exact repeat', async () => {
    const firstRunId = await createRunningRun();
    const firstGateway = createGateway(liveBindingResult);
    const clock = fixedClock();
    const firstWorkflow = new ScientificWorkflowService(
      database.repositories,
      database.transactionManager,
      firstGateway.gateway,
      new UnavailableWorkflowExecutionPort(),
      true,
      clock,
    );

    await firstWorkflow.start({ runId: firstRunId, requestId: 'cache-write' });

    const cacheKey = buildBindingCacheKey({
      proteinHash: validatedFasta.sha256,
      candidateType: 'MHCI',
      alleles: runConfiguration.analysis.mhci.alleles,
      peptideLengths: runConfiguration.analysis.mhci.peptideLengths,
      methods: runConfiguration.analysis.mhci.methods,
      ruleProfileVersion: runConfiguration.ruleProfileVersion,
      rankingProfileVersion: runConfiguration.rankingProfileVersion,
    });
    const cached = await database.repositories.cacheEntries.findReusable(cacheKey, clock());
    expect(cached?.schemaVersion).toBe('scientific-binding-cache-v1');
    expect(firstGateway.calls.filter((tool) => tool === 'predict_mhci')).toHaveLength(1);

    const secondRunId = await createRunningRun();
    const secondGateway = createGateway(liveBindingResult, { failLivePrediction: true });
    const secondWorkflow = new ScientificWorkflowService(
      database.repositories,
      database.transactionManager,
      secondGateway.gateway,
      new UnavailableWorkflowExecutionPort(),
      true,
      clock,
    );

    await secondWorkflow.start({ runId: secondRunId, requestId: 'cache-read' });

    expect(secondGateway.calls).not.toContain('predict_mhci');
    const executions = await database.repositories.predictorExecutions.listByRun(secondRunId);
    expect(executions.map(({ sourceStatus }) => sourceStatus)).toContain('CACHED');
  }, 30_000);

  it('replays an exact approved fixture without calling the remote MCP gateway', async () => {
    const runId = await createRunningRun({
      requestedExecutionMode: 'FIXTURE',
      fallbackPolicy: 'FIXTURE_ONLY',
    });
    let fixtureStarted = false;
    const workflow = new ScientificWorkflowService(
      database.repositories,
      database.transactionManager,
      {
        assertAvailable: async () => {
          throw new Error('remote MCP should not be required for fixture-only replay');
        },
        call: async () => {
          throw new Error('remote MCP should not be called for fixture-only replay');
        },
      },
      {
        assertAvailable: async () => undefined,
        start: async ({ runId: startedRunId }) => {
          fixtureStarted = startedRunId === runId;
        },
        cancel: async () => undefined,
        retry: async () => undefined,
      },
      true,
      fixedClock(),
    );

    await workflow.start({ runId, requestId: 'fixture-only' });

    expect(fixtureStarted).toBe(true);
  });

  it('falls through to fixture replay when MCP is unavailable under AUTO policy', async () => {
    const runId = await createRunningRun({
      requestedExecutionMode: 'AUTO',
      fallbackPolicy: 'CACHE_THEN_LIVE_THEN_FIXTURE',
    });
    let fixtureStarted = false;
    const workflow = new ScientificWorkflowService(
      database.repositories,
      database.transactionManager,
      {
        assertAvailable: async () => {
          throw new DependencyUnavailableError('NitroStack MCP server');
        },
        call: async () => {
          throw new Error('remote MCP call should be skipped after failed preflight');
        },
      },
      {
        assertAvailable: async () => undefined,
        start: async ({ runId: startedRunId }) => {
          fixtureStarted = startedRunId === runId;
        },
        cancel: async () => undefined,
        retry: async () => undefined,
      },
      true,
      fixedClock(),
    );

    await workflow.start({ runId, requestId: 'auto-mcp-down' });

    expect(fixtureStarted).toBe(true);
  });

  it('persists a synthetic run for arbitrary non-fixture proteins', async () => {
    const runId = await createRunningRun({
      requestedExecutionMode: 'SYNTHETIC',
      fallbackPolicy: 'CACHE_THEN_LIVE_THEN_FIXTURE',
      populations: ['synthetic-population-alpha', 'synthetic-population-beta'],
    });
    const gateway = createGateway(liveBindingResult, { synthetic: true });
    const workflow = new ScientificWorkflowService(
      database.repositories,
      database.transactionManager,
      gateway.gateway,
      new UnavailableWorkflowExecutionPort(),
      true,
      fixedClock(),
    );

    await workflow.start({ runId, requestId: 'synthetic-arbitrary' });

    const run = await database.repositories.runs.findDetailById(runId);
    const executions = await database.repositories.predictorExecutions.listByRun(runId);
    const candidates = await database.repositories.candidates.listByRun(runId);
    expect(run?.executionMode).toBe('SYNTHETIC');
    expect(executions.every(({ sourceStatus }) => sourceStatus === 'SYNTHETIC')).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
    const optimization = await database.repositories.shortlistOptimizationResults.findLatest(
      runId,
      'MHCI',
    );
    expect(optimization?.algorithmId).toBe('deterministic-genetic-construct-optimizer');
    expect(optimization?.selectionSteps.length).toBeGreaterThan(0);
    expect(optimization?.finalCoverageResult.projectedCoverage).toBeGreaterThan(0);
    expect(gateway.calls).toContain('predict_synthetic_binding');
    expect(gateway.calls).toContain('optimize_shortlist_coverage');
  });
});

async function createRunningRun(overrides: Partial<typeof runConfiguration> = {}): Promise<string> {
  const project = await database.repositories.projects.create({
    name: `Cache workflow ${randomUUID()}`,
    organism: 'Synthetic organism',
    proteinName: 'Synthetic protein',
  });
  const protein = await database.repositories.proteins.create({
    projectId: project.id,
    originalFasta: fasta,
    header: validatedFasta.header,
    normalizedSequence: validatedFasta.normalizedSequence,
    sequenceLength: validatedFasta.sequenceLength,
    sha256: validatedFasta.sha256,
    validationProfileVersion: 'mvp-v1.0',
  });
  const [biologicalConstraints, ranking] = await Promise.all([
    loadProfileVersion('biologicalConstraints', 'mvp-v1.0'),
    loadProfileVersion('ranking', 'mvp-v1.0'),
  ]);
  const snapshot = {
    request: { ...runConfiguration, ...overrides },
    profiles: {
      biologicalConstraints: biologicalConstraints.metadata,
      ranking: ranking.metadata,
    },
  };
  const configurationJson = serializeRunConfiguration(snapshot);
  const run = await database.repositories.runs.create({
    projectId: project.id,
    proteinInputId: protein.id,
    revision: 1,
    status: 'RUNNING',
    configurationJson,
    configurationHash: sha256(configurationJson),
    ruleProfileVersion: (snapshot.request as typeof runConfiguration).ruleProfileVersion,
    rankingProfileVersion: (snapshot.request as typeof runConfiguration).rankingProfileVersion,
    requestedExecutionMode: (snapshot.request as typeof runConfiguration).requestedExecutionMode,
    startedAt: fixedClock()(),
  });
  return run.id;
}

function createGateway(
  bindingResult: BindingResult,
  options: { failLivePrediction?: boolean; synthetic?: boolean } = {},
): { gateway: McpToolGateway; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    gateway: {
      assertAvailable: async () => undefined,
      call: async <T>(toolName: string, input: unknown, schema: z.ZodType<T>) => {
        calls.push(toolName);
        if (toolName === 'predict_mhci' && options.failLivePrediction === true) {
          throw new Error('Live prediction should not be called on cache hit.');
        }
        return toolResult(
          toolName,
          schema.parse(resolveToolData(toolName, input, bindingResult, options)),
        );
      },
    },
  };
}

function resolveToolData(
  toolName: string,
  input: unknown,
  bindingResult: BindingResult,
  options: { synthetic?: boolean } = {},
): unknown {
  switch (toolName) {
    case 'validate_sequence':
      return {
        normalizedSequence: validatedFasta.normalizedSequence,
        header: validatedFasta.header,
        sequenceLength: validatedFasta.sequenceLength,
        sha256: validatedFasta.sha256,
        warnings: [],
      };
    case 'predict_mhci':
      return bindingResult;
    case 'generate_candidate_peptides':
      return {
        candidates: [
          {
            candidateRef: 'synthetic-candidate-1',
            candidateType: 'MHCI',
            peptide: 'ACDEFGHIK',
            start: 1,
            end: 9,
            length: 9,
          },
        ],
      };
    case 'predict_synthetic_binding':
      return {
        observations: [
          {
            observationId: 'synthetic-observation-1',
            candidateRef: 'synthetic-candidate-1',
            candidateType: 'MHCI',
            peptide: 'ACDEFGHIK',
            start: 1,
            end: 9,
            length: 9,
            allele: 'HLA-A*02:01',
            method: 'synthetic-binding',
            methodVersion: '1.0.0',
            rawScore: 0.74,
            percentileRank: 1.2,
            normalizedScore: 0.988,
            rawFields: { predictionSource: 'SYNTHETIC', scientificUse: false },
          },
        ],
        provenance: {
          connectorId: 'immunograph-synthetic-predictor',
          connectorVersion: '1.0.0',
          method: 'synthetic-binding',
          methodVersion: '1.0.0',
          status: 'SYNTHETIC',
          sourceUri: 'https://immunograph.local/synthetic-predictor',
          parameters: { candidateType: 'MHCI' },
          predictionSource: 'SYNTHETIC',
          scientificUse: false,
          validationStatus: 'DEMONSTRATION_ONLY',
          algorithm: 'DeterministicSyntheticBindingPredictor',
          algorithmVersion: '1.0.0',
          datasetVersion: 'synthetic-v1',
          datasetHash: '3'.repeat(64),
        },
      };
    case 'normalize_scores':
      return {
        values: (options.synthetic
          ? [{ observationId: 'synthetic-observation-1' }]
          : bindingResult.observations
        ).map((observation) => ({
          observationId: observation.observationId,
          normalizedScore: 0.995,
          transformation: { kind: 'INVERSE_PERCENTILE', cap: 100 },
        })),
      };
    case 'compute_consensus_batch':
      return {
        groups: parseGroups(input).map((group) => ({
          groupKey: group.groupKey,
          weightedMean: 0.995,
          weightedVariance: 0,
          agreement: 1,
          agreementStatus: 'SUFFICIENT_OBSERVATIONS',
          completeness: 1,
          consensus: 0.995,
        })),
      };
    case 'calculate_synthetic_population_coverage':
      return {
        populations: (input as { populationIds: string[] }).populationIds.map(
          (populationId, index) => ({
            populationId,
            projectedCoverage: index === 0 ? 0.42 : 0.37,
            averageHits: 0.5,
            alleleCarrierProbabilities: [
              { allele: 'HLA-A*02:01', carrierProbability: index === 0 ? 0.42 : 0.37 },
            ],
          }),
        ),
        unavailablePopulationIds: [],
        provenance: {
          connectorId: 'immunograph-synthetic-coverage',
          connectorVersion: '1.0.0',
          method: 'synthetic-diploid-independence-demonstration',
          methodVersion: '1.0.0',
          status: 'SYNTHETIC',
          sourceUri: 'https://immunograph.local/reference/hla-alleles',
          parameters: { classMode: 'CLASS_I' },
          predictionSource: 'SYNTHETIC',
          scientificUse: false,
          validationStatus: 'DEMONSTRATION_ONLY',
          algorithm: 'DeterministicSyntheticPopulationCoverage',
          algorithmVersion: '1.0.0',
          datasetVersion: 'synthetic-hla-v1',
          datasetHash: '4'.repeat(64),
        },
      };
    case 'validate_thresholds':
      return {
        ruleProfileVersion: 'mvp-v1.0',
        results: parseCandidates(input).map(({ candidateId }) => ({
          candidateId,
          passesAllHardConstraints: true,
          outcomes: [
            {
              ruleId: 'BINDING-001',
              ruleVersion: 'mvp-v1.0',
              severity: 'HARD',
              outcome: 'PASS',
              evidenceRefs: ['obs-live-1'],
              message: 'Binding evidence passes the configured threshold.',
            },
          ],
        })),
      };
    case 'apply_constraint_rules':
      return {
        snapshotHash: parseSnapshotHash(input),
        ruleProfileVersion: 'mvp-v1.0',
        constraintResults: [],
        duplicateLinks: [],
        retainedCandidateIds: parseOverlapCandidates(input).map(({ id }) => id),
        overlapRejections: [],
        eligibleCandidateIds: parseOverlapCandidates(input).map(({ id }) => id),
      };
    case 'rank_candidates':
      return rankCandidates(input);
    case 'optimize_shortlist_coverage':
      return {
        steps: [
          {
            candidateId: (input as { eligibleCandidateIds: string[] }).eligibleCandidateIds[0],
            marginalGain: 0.395,
            cumulativeCoverage: 0.395,
          },
        ],
        selectedCandidateIds: [
          (input as { eligibleCandidateIds: string[] }).eligibleCandidateIds[0],
        ],
        finalCoverage: 0.395,
        coverageByPopulation: {
          'synthetic-population-alpha': 0.42,
          'synthetic-population-beta': 0.37,
        },
        constructSequence: 'ACDEFGHIK',
        averageCandidateScore: 0.895,
        redundancyPenalty: 0,
        objectiveScore: 0.63,
        confidence: {
          label: 'MEDIUM',
          score: 0.67,
          uncertainty: 0.33,
          calibrationMethod: 'deterministic-evidence-quality-bins',
          scientificUse: false,
          reasons: ['No live scientific predictor provenance'],
        },
        manufacturability: {
          status: 'PASS',
          checks: [
            {
              ruleId: 'MFG-LENGTH-001',
              status: 'PASS',
              message: 'Construct length 9/500.',
            },
          ],
        },
        provenance: {
          connectorId: 'immunograph-construct-optimizer',
          connectorVersion: '1.0.0',
          method: 'deterministic-genetic-construct-optimizer',
          methodVersion: '1.0.0',
          status: 'SYNTHETIC',
          sourceUri: 'https://immunograph.local/algorithms/construct-optimization',
          parameters: { scientificUse: false },
          predictionSource: 'SYNTHETIC',
          scientificUse: false,
          validationStatus: 'DEMONSTRATION_ONLY',
          algorithm: 'deterministic-genetic-construct-optimizer',
          algorithmVersion: '1.0.0',
        },
      };
    default:
      throw new Error(`Unexpected tool call ${toolName}.`);
  }
}

function rankCandidates(input: unknown) {
  const parsed = input as {
    phase: 'PRELIMINARY' | 'FINAL';
    candidates: Array<{
      candidateId: string;
      candidateKey: string;
      candidateType: 'MHCI';
      agreement: number;
      completeness: number;
      start: number;
      blockingReviewCondition: boolean;
      ruleOutcomes: unknown[];
    }>;
  };
  const candidates = parsed.candidates.map((candidate, index) => ({
    candidateId: candidate.candidateId,
    ...(parsed.phase === 'FINAL'
      ? {
          candidateKey: candidate.candidateKey,
          candidateType: candidate.candidateType,
          agreement: candidate.agreement,
          completeness: candidate.completeness,
          start: candidate.start,
          blockingReviewCondition: candidate.blockingReviewCondition,
          ruleOutcomes: candidate.ruleOutcomes,
          category: 'RECOMMENDED',
          confidence: 'HIGH',
          confidenceScore: 0.95,
          trackRank: index + 1,
          categoryRank: index + 1,
        }
      : {}),
    componentScores: { binding: 0.995, consensus: 0.995, populationCoverage: 0, completeness: 1 },
    scoreBeforePenalty: 0.895,
    missingEvidencePenalty: 0,
    softWarningPenalty: 0,
    fixturePenalty: 0,
    finalScore: 0.895,
  }));
  return { phase: parsed.phase, candidates };
}

function parseGroups(input: unknown): Array<{ groupKey: string }> {
  return (input as { groups: Array<{ groupKey: string }> }).groups;
}

function parseCandidates(input: unknown): Array<{ candidateId: string }> {
  return (input as { candidates: Array<{ candidateId: string }> }).candidates;
}

function parseOverlapCandidates(input: unknown): Array<{ id: string }> {
  return (input as { overlapCandidates: Array<{ id: string }> }).overlapCandidates;
}

function parseSnapshotHash(input: unknown): string {
  return (input as { snapshotHash: string }).snapshotHash;
}

function toolResult<T>(toolName: string, data: T): McpToolResult<T> {
  return {
    data,
    meta: {
      requestId: 'test-request',
      runId: 'test-run',
      toolName,
      toolVersion: 'test',
      startedAt: fixedClock()().toISOString(),
      completedAt: fixedClock()().toISOString(),
      durationMs: 1,
      inputHash: '1'.repeat(64),
      outputHash: '2'.repeat(64),
    },
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixedClock() {
  return () => new Date('2026-07-25T00:00:00.000Z');
}
