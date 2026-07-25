import 'reflect-metadata';

import { buildTools, McpApplicationFactory } from '@nitrostack/core';
import type { ExecutionContext, JsonValue, Logger } from '@nitrostack/core';
import { loadFixtureRegistry } from '@immunograph/database';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import type { CapabilityPort } from './common/capability-port.js';
import { AppModule } from './app.module.js';
import { PredictionController } from './prediction/prediction.controller.js';
import { TOOL_GROUPS } from './tool-catalog.js';

const EXPECTED_TOOL_NAMES = [
  'apply_constraint_rules',
  'calculate_population_coverage',
  'calculate_synthetic_population_coverage',
  'categorize_candidates',
  'compute_consensus',
  'compute_consensus_batch',
  'describe_agentic_workflow',
  'detect_overlapping_epitopes',
  'explain_candidate',
  'export_candidates',
  'export_workflow_trace',
  'generate_candidate_peptides',
  'generate_report',
  'normalize_scores',
  'optimize_shortlist_coverage',
  'predict_bcell',
  'predict_mhci',
  'predict_mhcii',
  'predict_synthetic_binding',
  'rank_candidates',
  'remove_duplicate_candidates',
  'validate_sequence',
  'validate_thresholds',
  'visualize_results',
] as const;

const tools = TOOL_GROUPS.flatMap((group) =>
  buildTools(group.controller as unknown as Record<string, unknown>),
);

class CapturingLogger implements Logger {
  readonly entries: Array<{ level: string; message: string; meta?: Record<string, JsonValue> }> =
    [];

  debug(message: string, meta?: Record<string, JsonValue>): void {
    this.entries.push({ level: 'debug', message, ...(meta === undefined ? {} : { meta }) });
  }

  info(message: string, meta?: Record<string, JsonValue>): void {
    this.entries.push({ level: 'info', message, ...(meta === undefined ? {} : { meta }) });
  }

  warn(message: string, meta?: Record<string, JsonValue>): void {
    this.entries.push({ level: 'warn', message, ...(meta === undefined ? {} : { meta }) });
  }

  error(message: string, meta?: Record<string, JsonValue>): void {
    this.entries.push({ level: 'error', message, ...(meta === undefined ? {} : { meta }) });
  }
}

const createContext = (logger = new CapturingLogger()): ExecutionContext => ({
  requestId: 'request-1',
  logger,
  metadata: { runId: 'run-1' },
});

const toolByName = (name: string) => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`Missing tool ${name}`);
  return tool;
};

describe('MCP tool catalog', () => {
  it('registers every group in the single NitroStack application module', async () => {
    const application = await McpApplicationFactory.create(AppModule);
    const registered = (application as unknown as { tools: unknown[] }).tools;
    expect(registered).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  it('discovers one server catalog with four groups and all documented tools', async () => {
    expect(TOOL_GROUPS.map((group) => group.name)).toEqual([
      'Prediction Tools',
      'Evidence Tools',
      'Constraint Tools',
      'Report Tools',
    ]);
    expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOL_NAMES);
    const discovered = await Promise.all(tools.map((tool) => tool.toMcpTool()));
    expect(discovered.every((tool) => tool.inputSchema.type === 'object')).toBe(true);
    expect(discovered.every((tool) => tool.outputSchema === undefined)).toBe(true);
  });

  it('provides positive and negative input schema cases plus deterministic envelope examples', () => {
    for (const tool of tools) {
      const inputSchema = tool.inputSchema as z.ZodType;
      expect(tool.examples?.request, `${tool.name} request example`).toBeDefined();
      expect(
        inputSchema.safeParse(tool.examples?.request).success,
        `${tool.name} positive input`,
      ).toBe(true);
      expect(inputSchema.safeParse({}).success, `${tool.name} negative input`).toBe(false);
      expect(tool.examples?.response, `${tool.name} output envelope`).toMatchObject({
        ok: false,
        error: expect.objectContaining({ code: expect.any(String) }),
        meta: expect.objectContaining({ toolName: tool.name }),
      });
    }
  });

  it('executes algorithm-backed tools through validated deterministic envelopes', async () => {
    const validateResult = await toolByName('validate_sequence').execute(
      { fasta: '>protein\nACDEFGHIK', profileVersion: 'mvp-v1.0' },
      createContext(),
    );
    expect(validateResult).toMatchObject({
      ok: true,
      data: { normalizedSequence: 'ACDEFGHIK', sequenceLength: 9 },
    });

    const duplicateResult = await toolByName('remove_duplicate_candidates').execute(
      {
        runId: 'run-1',
        proteinHash: 'a'.repeat(64),
        candidates: [
          {
            id: 'position-1',
            candidateType: 'MHCI',
            start: 1,
            end: 9,
            peptide: 'ACDEFGHIK',
            allele: 'HLA-A*02:01',
            observationRefs: [],
          },
          {
            id: 'position-2',
            candidateType: 'MHCI',
            start: 2,
            end: 10,
            peptide: 'ACDEFGHIK',
            allele: 'HLA-A*02:01',
            observationRefs: [],
          },
        ],
      },
      createContext(),
    );
    expect(duplicateResult).toMatchObject({ ok: true });
    if (
      typeof duplicateResult === 'object' &&
      duplicateResult !== null &&
      'data' in duplicateResult
    ) {
      expect(
        (duplicateResult.data as { canonicalCandidates: unknown[] }).canonicalCandidates,
      ).toHaveLength(2);
    }
  });

  it('maps scientific validation failures to stable documented error codes', async () => {
    const empty = await toolByName('validate_sequence').execute(
      { fasta: '', profileVersion: 'mvp-v1.0' },
      createContext(),
    );
    expect(empty).toMatchObject({ ok: false, error: { code: 'FASTA_EMPTY' } });

    const missingProfile = await toolByName('normalize_scores').execute(
      {
        runId: 'run-1',
        registryVersion: 'mvp-v1.0',
        observations: [{ observationId: 'obs-1', rawScore: 0.8 }],
      },
      createContext(),
    );
    expect(missingProfile).toMatchObject({
      ok: false,
      error: { code: 'NORMALIZATION_PROFILE_MISSING' },
    });
  });

  it('uses shared scoring before preliminary and final ranking', async () => {
    const base = {
      runId: 'run-1',
      rankingProfileVersion: 'mvp-v1.0',
      baseConstraintsComplete: true,
      finalConstraintsComplete: true,
      candidates: [
        {
          candidateId: 'candidate-1',
          candidateKey: 'key-1',
          candidateType: 'MHCI',
          bindingQuality: 0.8,
          consensusQuality: 0.8,
          candidateCoverage: 0.7,
          agreement: 0.9,
          completeness: 1,
          missingOptionalWeightFraction: 0,
          softWarningCount: 0,
          start: 1,
          blockingReviewCondition: false,
          ruleOutcomes: [],
        },
      ],
    };
    const preliminary = await toolByName('rank_candidates').execute(
      { ...base, phase: 'PRELIMINARY' },
      createContext(),
    );
    expect(preliminary).toMatchObject({
      ok: true,
      data: { phase: 'PRELIMINARY', candidates: [{ finalScore: 0.8 }] },
    });

    const final = await toolByName('rank_candidates').execute(
      { ...base, phase: 'FINAL' },
      createContext(),
    );
    expect(final).toMatchObject({
      ok: true,
      data: {
        phase: 'FINAL',
        candidates: [{ finalScore: 0.8, category: 'RECOMMENDED', trackRank: 1 }],
      },
    });
  });

  it('fails closed when no approved fixture exactly matches the request', async () => {
    const result = await toolByName('predict_mhci').execute(
      {
        ...(toolByName('predict_mhci').examples?.request as Record<string, unknown>),
        fallbackPolicy: 'FIXTURE_ONLY',
      },
      createContext(),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'FIXTURE_NOT_FOUND', retryable: false },
    });
  });

  it('returns schema-valid synthetic observations for an exact approved fixture', async () => {
    const fixture = (await loadFixtureRegistry()).cases.find(
      ({ fixtureId }) => fixtureId === 'covid-spike',
    )!;
    const result = await toolByName('predict_mhci').execute(
      {
        runId: 'fixture-run',
        proteinRef: fixture.proteinSha256,
        alleles: ['HLA-A*02:01'],
        peptideLengths: [9, 10],
        methods: ['iedb-recommended'],
        fallbackPolicy: 'FIXTURE_ONLY',
      },
      createContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        observations: [expect.objectContaining({ method: 'iedb-recommended' })],
        provenance: [expect.objectContaining({ status: 'FIXTURE', fixtureId: 'covid-spike' })],
      },
    });
  });

  it('keeps GraphBepi on the fixture-only path and rejects live provenance', async () => {
    const calls: string[] = [];
    const port: CapabilityPort = {
      invoke(capability) {
        calls.push(capability);
        return Promise.resolve({
          residueScores: [],
          regions: [],
          rawMethodFields: {},
          provenance: [
            {
              connectorId: 'graphbepi',
              connectorVersion: '1.0.0',
              method: 'graphbepi',
              methodVersion: '1.0.0',
              status: 'LIVE',
              parameters: {},
            },
          ],
        });
      },
    };
    const controller = new PredictionController().useCapabilityPort(port);
    const graphBepi = buildTools(controller as unknown as Record<string, unknown>).find(
      (tool) => tool.name === 'predict_bcell',
    );
    if (graphBepi === undefined) throw new Error('Missing predict_bcell');

    const result = await graphBepi.execute(graphBepi.examples?.request, createContext());

    expect(calls).toEqual(['predict_bcell_fixture']);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'GRAPHBEPI_PROVENANCE_INVALID', retryable: false },
    });
  });

  it('keeps deterministic explanations successful when optional LLM paraphrasing fails', async () => {
    const example = toolByName('explain_candidate').examples?.request as Record<string, unknown>;
    const result = await toolByName('explain_candidate').execute(
      { ...example, explanationMode: 'LLM_PARAPHRASE' },
      createContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      data: { deterministic: { text: expect.any(String) }, llmParaphrase: null },
    });
  });

  it('exposes the single-app agentic orchestration plan without adding another MCP server', async () => {
    const result = await toolByName('describe_agentic_workflow').execute(
      {
        runId: 'run-1',
        runIntent: 'MVP_EPITOPE_PRIORITIZATION',
        includeFutureInterfaces: true,
      },
      createContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        deploymentBoundary: 'ONE_NITROSTACK_MCP_APP',
        guardrails: {
          authRequired: false,
          conservationInMvp: false,
          toxicityInMvp: false,
          graphBepiMode: 'FIXTURE_ONLY',
          syntheticScientificUse: false,
        },
        finalResearchPackage: {
          requiredArtifact: 'research-package.zip',
          includesCsvExports: true,
        },
      },
    });
    if (typeof result === 'object' && result !== null && 'data' in result) {
      const data = result.data as {
        agents: Array<{
          agentId: string;
          status: string;
          decisionPolicy: {
            mayGenerateScientificValues: boolean;
            mustUseMcpToolsForEvidence: boolean;
            mustExposeProvenance: boolean;
          };
        }>;
        workflowPlan: { nodes: Array<{ nodeId: string; toolNames: string[] }> };
        finalResearchPackage: { requiredSections: string[] };
      };
      expect(data.agents.map((agent) => agent.agentId)).toEqual([
        'supervisor-orchestrator',
        'sequence-validation',
        'immunology',
        'structure',
        'compound',
        'ranking',
        'verifier',
        'reporting',
      ]);
      expect(
        data.agents.every(
          (agent) =>
            agent.decisionPolicy.mayGenerateScientificValues === false &&
            agent.decisionPolicy.mustUseMcpToolsForEvidence === true &&
            agent.decisionPolicy.mustExposeProvenance === true,
        ),
      ).toBe(true);
      expect(data.workflowPlan.nodes.at(-1)).toMatchObject({
        nodeId: 'generate-research-package',
        toolNames: ['generate_report', 'export_candidates', 'export_workflow_trace'],
      });
      expect(data.finalResearchPackage.requiredSections).toContain('construct/');
      expect(data.finalResearchPackage.requiredSections).toContain('reports/');
    }
  });

  it('emits structured start and finish logs without sequence bodies', async () => {
    const logger = new CapturingLogger();
    await toolByName('validate_sequence').execute(
      { fasta: '>protein\nACDEFGHIK', profileVersion: 'mvp-v1.0' },
      createContext(logger),
    );
    expect(logger.entries.map((entry) => entry.message)).toEqual([
      'mcp.tool.start',
      'mcp.tool.finish',
    ]);
    expect(JSON.stringify(logger.entries)).not.toContain('ACDEFGHIK');
    expect(logger.entries[1]?.meta).toMatchObject({ success: true, toolName: 'validate_sequence' });
  });
});
