import 'reflect-metadata';

import { buildTools, McpApplicationFactory } from '@nitrostack/core';
import type { ExecutionContext, JsonValue, Logger } from '@nitrostack/core';
import { loadFixtureRegistry } from '@immunograph/database';
import { afterEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import type { CapabilityPort } from './common/capability-port.js';
import { AppModule } from './app.module.js';
import { PredictionController } from './prediction/prediction.controller.js';
import { TOOL_GROUPS } from './tool-catalog.js';

const EXPECTED_TOOL_NAMES = [
  'apply_constraint_rules',
  'calculate_molecular_descriptors',
  'calculate_population_coverage',
  'calculate_structure_confidence',
  'calculate_surface_accessibility',
  'calculate_synthetic_population_coverage',
  'calibrate_confidence',
  'categorize_candidates',
  'chat_with_research_agent',
  'cluster_docking_poses',
  'compute_consensus',
  'compute_consensus_batch',
  'deduplicate_compounds',
  'describe_agentic_workflow',
  'detect_overlapping_epitopes',
  'explain_candidate',
  'export_candidates',
  'export_research_package',
  'export_workflow_trace',
  'extract_interactions',
  'fetch_compound',
  'fetch_structure',
  'generate_candidate_peptides',
  'generate_report',
  'map_epitopes_to_structure',
  'normalize_scores',
  'optimize_construct_genetic',
  'optimize_shortlist_coverage',
  'predict_bcell',
  'predict_mhci',
  'predict_mhcii',
  'predict_synthetic_binding',
  'prepare_ligand',
  'prepare_receptor',
  'rank_candidates',
  'remove_duplicate_candidates',
  'run_agentic_workflow',
  'run_docking',
  'validate_compound',
  'validate_docking_box',
  'validate_sequence',
  'validate_structure',
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

afterEach(() => {
  delete process.env.LLM_ENABLED;
  delete process.env.OPENAI_API_KEY;
});

describe('MCP tool catalog', () => {
  it('registers every group in the single NitroStack application module', async () => {
    const application = await McpApplicationFactory.create(AppModule);
    const registered = (application as unknown as { tools: unknown[] }).tools;
    expect(registered).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  it('discovers one server catalog with strict PRD v1.1 tool modules and documented tools', async () => {
    expect(TOOL_GROUPS.map((group) => group.name)).toEqual([
      'Immunoinformatics Tools',
      'Evidence Tools',
      'Constraint Tools',
      'Structure Tools',
      'Chemistry Tools',
      'Docking Tools',
      'Report / Export Tools',
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
          langGraphRequired: true,
          llmAgentModeRequiredWhenConfigured: true,
          deterministicFallbackRequired: true,
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
        'intake-policy',
        'sequence-validation',
        't-cell',
        'b-cell',
        'population',
        'structure',
        'compound-intelligence',
        'docking',
        'ranking',
        'verifier-critic',
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
        nodeId: 'export-research-package',
        toolNames: [
          'generate_report',
          'export_candidates',
          'export_workflow_trace',
          'export_research_package',
          'chat_with_research_agent',
        ],
      });
      expect(data.finalResearchPackage.requiredSections).toContain('construct/');
      expect(data.finalResearchPackage.requiredSections).toContain('structure/');
      expect(data.finalResearchPackage.requiredSections).toContain('compounds/');
      expect(data.finalResearchPackage.requiredSections).toContain('docking/');
      expect(data.finalResearchPackage.requiredSections).toContain('reports/');
    }
  });

  it('runs the mandatory bounded agent workflow through deterministic fallback when no LLM is configured', async () => {
    const result = await toolByName('run_agentic_workflow').execute(
      {
        runId: 'run-1',
        objective: 'Prioritize epitopes with structure, chemistry, and docking governance.',
        agentMode: 'DETERMINISTIC',
        approvedToolNames: [...EXPECTED_TOOL_NAMES],
        requireHumanApproval: true,
      },
      createContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        runtime: 'LANGGRAPH',
        agentMode: 'DETERMINISTIC',
        status: 'AWAITING_APPROVAL',
        nextApprovalGate: 'configuration_approval',
      },
    });
    if (typeof result === 'object' && result !== null && 'data' in result) {
      const data = result.data as {
        steps: Array<{ loop: string[]; agentId: string; decision: string }>;
      };
      expect(data.steps[0]?.loop).toEqual(['PLAN', 'ACT', 'OBSERVE', 'VERIFY', 'DECIDE']);
      expect(data.steps.map((step) => step.agentId)).toContain('supervisor-orchestrator');
      expect(data.steps.map((step) => step.agentId)).toContain('docking');
      expect(data.steps.every((step) => step.decision !== 'INVENT_SCIENTIFIC_VALUE')).toBe(true);
    }
  });

  it('runs LLM-requested agent workflow through deterministic routing when the LLM provider is not configured', async () => {
    process.env.LLM_ENABLED = 'false';
    delete process.env.OPENAI_API_KEY;

    const result = await toolByName('run_agentic_workflow').execute(
      {
        runId: 'run-1',
        objective: 'Use the agent workflow without inventing scientific values.',
        agentMode: 'LLM',
        approvedToolNames: [...EXPECTED_TOOL_NAMES],
        requireHumanApproval: true,
      },
      createContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        runtime: 'LANGGRAPH',
        agentMode: 'LLM',
        llmUsed: false,
        status: 'AWAITING_APPROVAL',
        warnings: expect.arrayContaining(['llm-provider-not-configured']),
      },
    });
  });

  it('returns deterministic fixture-shaped outputs for mandatory structure, chemistry, and docking tools', async () => {
    const structure = await toolByName('fetch_structure').execute(
      {
        runId: 'run-1',
        targetId: 'target-1',
        source: 'FIXTURE',
        accession: 'fixture-structure-1',
        fallbackPolicy: 'FIXTURE_ONLY',
      },
      createContext(),
    );
    expect(structure).toMatchObject({
      ok: true,
      data: {
        structure: { sourceStatus: 'FIXTURE', scientificUse: false },
        provenance: { status: 'FIXTURE', scientificUse: false },
      },
    });

    const compound = await toolByName('fetch_compound').execute(
      {
        runId: 'run-1',
        compoundRef: 'fixture-compound-1',
        source: 'FIXTURE',
        fallbackPolicy: 'FIXTURE_ONLY',
      },
      createContext(),
    );
    expect(compound).toMatchObject({
      ok: true,
      data: {
        compound: { sourceStatus: 'FIXTURE', scientificUse: false },
        provenance: { status: 'FIXTURE', scientificUse: false },
      },
    });

    const docking = await toolByName('run_docking').execute(
      {
        runId: 'run-1',
        receptorId: 'fixture-receptor-1',
        ligandId: 'fixture-ligand-1',
        dockingBoxId: 'fixture-box-1',
        mode: 'FIXTURE',
        fallbackPolicy: 'FIXTURE_ONLY',
      },
      createContext(),
    );
    expect(docking).toMatchObject({
      ok: true,
      data: {
        dockingRun: { sourceStatus: 'FIXTURE', scientificUse: false },
        provenance: { status: 'FIXTURE', scientificUse: false },
      },
    });
  });

  it('fails closed for mandatory structure, chemistry, and docking tools when live-only execution is requested without live adapters', async () => {
    await expect(
      toolByName('fetch_structure').execute(
        {
          runId: 'run-1',
          targetId: 'target-1',
          source: 'RCSB_PDB',
          accession: '1ABC',
          fallbackPolicy: 'LIVE_ONLY',
        },
        createContext(),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'STRUCTURE_LIVE_CONNECTOR_UNAVAILABLE', category: 'CONNECTOR' },
    });

    await expect(
      toolByName('fetch_compound').execute(
        {
          runId: 'run-1',
          compoundRef: '2244',
          source: 'PUBCHEM',
          fallbackPolicy: 'LIVE_ONLY',
        },
        createContext(),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'CHEMISTRY_LIVE_CONNECTOR_UNAVAILABLE', category: 'CONNECTOR' },
    });

    await expect(
      toolByName('run_docking').execute(
        {
          runId: 'run-1',
          receptorId: 'receptor-1',
          ligandId: 'ligand-1',
          dockingBoxId: 'box-1',
          mode: 'VINA',
          fallbackPolicy: 'LIVE_ONLY',
        },
        createContext(),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'DOCKING_RUNTIME_UNAVAILABLE', category: 'CONNECTOR' },
    });
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
