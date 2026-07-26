import 'reflect-metadata';

import { buildTools, getModuleMetadata, McpApplicationFactory } from '@nitrostack/core';
import type { ExecutionContext, JsonValue, Logger } from '@nitrostack/core';
import { loadFixtureRegistry } from '@immunograph/database/mcp';
import { afterEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import type { CapabilityPort } from './common/capability-port.js';
import { AppModule } from './app.module.js';
import { ChemistryController } from './chemistry/chemistry.controller.js';
import { DockingController } from './docking/docking.controller.js';
import { PredictionController } from './prediction/prediction.controller.js';
import { StructureController } from './structure/structure.controller.js';
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
  'create_molstar_view',
  'deduplicate_compounds',
  'describe_agentic_workflow',
  'detect_binding_pockets',
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
  it('configures NitroStack OAuth discovery so cloud startup does not log missing OAUTH_CONFIG', () => {
    const imports = getModuleMetadata(AppModule)?.imports ?? [];
    const oauthImport = imports.find(
      (imported) =>
        typeof imported === 'object' &&
        imported !== null &&
        imported.providers?.some(
          (provider) =>
            typeof provider === 'object' &&
            provider !== null &&
            'provide' in provider &&
            provider.provide === 'OAUTH_CONFIG',
        ),
    );
    expect(oauthImport).toBeDefined();
  });

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

  it('accepts external MCP-friendly input aliases for sequence validation and peptide lengths', async () => {
    const validateResult = await toolByName('validate_sequence').execute(
      { sequence: '>HA_spike\nMNTQILVQRMYSDFHFKTQGKEVLATVYAAQSE' },
      createContext(),
    );
    expect(validateResult).toMatchObject({
      ok: true,
      data: { normalizedSequence: 'MNTQILVQRMYSDFHFKTQGKEVLATVYAAQSE', sequenceLength: 33 },
    });

    const peptideResult = await toolByName('generate_candidate_peptides').execute(
      {
        sequence: 'MNTQILVQRMYSDFHFKTQGKEVLATVYAAQSE',
        candidateType: 'MHCI',
        lengths: [9, 10],
        overlapping: true,
      },
      createContext(),
    );
    expect(peptideResult).toMatchObject({ ok: true });
    if (typeof peptideResult === 'object' && peptideResult !== null && 'data' in peptideResult) {
      expect((peptideResult.data as { candidates: unknown[] }).candidates).toHaveLength(49);
    }
  });

  it('infers supported HLA alleles from reference data when MCP clients omit the list', async () => {
    const result = await toolByName('validate_thresholds').execute(
      {
        runId: 'claude-demo-run',
        ruleProfileVersion: 'mvp-v1.0',
        candidates: [
          {
            candidateId: 'candidate-with-reference-allele',
            candidateType: 'MHCI',
            peptideLength: 9,
            supportedAlleles: [],
            allele: 'HLA-A*02:01',
            allowedLengths: { MHCI: [9], MHCII: [15] },
            requiredEvidenceRefs: ['obs-1'],
            presentEvidenceRefs: ['obs-1'],
            bindingObservations: [{ evidenceRef: 'obs-1', percentileRank: 0.5, required: true }],
            bindingPercentileRankMaximum: 2,
          },
        ],
      },
      createContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          {
            candidateId: 'candidate-with-reference-allele',
            passesAllHardConstraints: true,
          },
        ],
      },
    });
  });

  it('categorizes mixed-track MCP batches by track instead of forcing clients to split them', async () => {
    const result = await toolByName('categorize_candidates').execute(
      {
        runId: 'claude-demo-run',
        thresholds: { recommendedMinimum: 0.75, reviewMinimum: 0.5 },
        candidates: [
          {
            candidateId: 'mhci-1',
            candidateKey: 'mhci-key',
            candidateType: 'MHCI',
            preliminaryScore: 0.82,
            agreement: 0.9,
            completeness: 1,
            start: 1,
            blockingReviewCondition: false,
            ruleOutcomes: [],
          },
          {
            candidateId: 'mhcii-1',
            candidateKey: 'mhcii-key',
            candidateType: 'MHCII',
            preliminaryScore: 0.81,
            agreement: 0.9,
            completeness: 1,
            start: 1,
            blockingReviewCondition: false,
            ruleOutcomes: [],
          },
        ],
      },
      createContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        candidates: [
          { candidateId: 'mhci-1', category: 'RECOMMENDED' },
          { candidateId: 'mhcii-1', category: 'RECOMMENDED' },
        ],
      },
    });
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

    const unconstrainedPreliminary = await toolByName('rank_candidates').execute(
      { ...base, phase: 'PRELIMINARY', baseConstraintsComplete: false },
      createContext(),
    );
    expect(unconstrainedPreliminary).toMatchObject({
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

  it('supports global and world aliases for synthetic population coverage', async () => {
    const result = await toolByName('calculate_synthetic_population_coverage').execute(
      {
        runId: 'claude-demo-run',
        associations: [
          { candidateId: 'candidate-1', allele: 'HLA-A*02:01' },
          { candidateId: 'candidate-2', allele: 'HLA-B*07:02' },
        ],
        populations: ['global', 'world'],
        classMode: 'CLASS_I',
      },
      createContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        populations: [
          { populationId: 'global', projectedCoverage: expect.any(Number) },
          { populationId: 'world', projectedCoverage: expect.any(Number) },
        ],
        unavailablePopulationIds: [],
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

  it('exports the final research package as an actual zip archive for MCP/LLM clients', async () => {
    const result = await toolByName('export_research_package').execute(
      {
        runId: 'run-1',
        idempotencyKey: 'research-package-run-1',
        includeStructure: true,
        includeChemistry: true,
        includeDocking: true,
        includeAgentTrace: true,
      },
      createContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        artifact: {
          mediaType: 'application/zip',
          reference: 'mcp://research-packages/run-1/research-package.zip',
        },
        includesCsvExports: true,
        includesAgentTrace: true,
      },
    });
    if (typeof result === 'object' && result !== null && 'data' in result) {
      const data = result.data as {
        artifact: { contentBase64: string; byteLength: number; sha256: string };
      };
      const zip = Buffer.from(data.artifact.contentBase64, 'base64');
      expect(zip.byteLength).toBe(data.artifact.byteLength);
      expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304');
      const zipListing = zip.toString('latin1');
      for (const requiredEntry of [
        'manifest.json',
        'project.json',
        'run.json',
        'configuration.json',
        'inputs/original-fasta.fasta',
        'predictions/connector-provenance.json',
        'candidates/ranked-candidates.json',
        'construct/construct.fasta',
        'evidence/workflow-trace.json',
        'reports/summary.md',
        'reports/report.csv',
        'checksums.json',
      ]) {
        expect(zipListing).toContain(requiredEntry);
      }
      expect(zipListing).not.toMatch(/^\s*\{/u);
    }
  });

  it('exports persisted API run snapshot data inside the MCP research package zip', async () => {
    const result = await toolByName('export_research_package').execute(
      {
        runId: 'run-1',
        idempotencyKey: 'research-package-run-1',
        includeStructure: true,
        includeChemistry: true,
        includeDocking: true,
        includeAgentTrace: true,
        packageSnapshot: {
          project: { id: 'project-1', name: 'Persisted Immunology Project' },
          run: { id: 'run-1', executionMode: 'HYBRID', quality: 'COMPLETE' },
          configuration: { requestedExecutionMode: 'HYBRID' },
          originalFasta: '>spike-demo\nMFVFLVLLPLVSSQCVNLTTRTQLPPAYTNSFTRGVY\n',
          normalizedSequence: { sha256: 'a'.repeat(64), length: 40 },
          inputChecksums: { originalFasta: 'b'.repeat(64), normalizedSequence: 'a'.repeat(64) },
          predictions: {
            mhci: { observations: [{ peptide: 'YLQPRTFLL', percentileRank: 0.12 }] },
            mhcii: { observations: [{ peptide: 'TQLPPAYTNSFTRGV', percentileRank: 1.8 }] },
            bcell: { observations: [{ peptide: 'CVNLTTRTQ', score: 0.74 }] },
            populationCoverage: [{ population: 'India', coverage: 0.62 }],
            connectorProvenance: [{ connectorId: 'iedb', status: 'LIVE' }],
          },
          candidates: {
            ranked: [{ candidateId: 'candidate-1', peptide: 'YLQPRTFLL', finalScore: 0.91 }],
            shortlisted: [{ candidateId: 'candidate-1', peptide: 'YLQPRTFLL' }],
            rejected: [],
            evidenceLinks: [{ candidateId: 'candidate-1', observationIds: ['obs-1'] }],
            csv: 'candidateId,peptide,finalScore\ncandidate-1,YLQPRTFLL,0.91\n',
          },
          structure: {
            structures: [{ structureId: 'AF-P0DTC2-F1', source: 'AlphaFold DB' }],
            epitopeStructureMap: [{ candidateId: 'candidate-1', residueRange: '10-18' }],
            surfaceAccessibility: [{ candidateId: 'candidate-1', score: 0.66 }],
            structureConfidence: [{ candidateId: 'candidate-1', plddt: 82 }],
          },
          compounds: {
            compounds: [{ compoundId: '2244', name: 'aspirin' }],
            descriptors: [{ compoundId: '2244', molecularWeight: 180.16 }],
            ligandPreparation: [{ compoundId: '2244', artifactRef: 'docking/ligand.pdbqt' }],
          },
          docking: {
            receptorPdbqt: 'REMARK persisted receptor\n',
            ligandPdbqt: 'REMARK persisted ligand\n',
            dockingOutputPdbqt: 'REMARK VINA RESULT: -6.300 0.000 0.000\n',
            dockingPoses: [{ poseId: 'pose-1', affinityKcalMol: -6.3 }],
            dockingSummary: { bestAffinityKcalMol: -6.3 },
            dockingProvenance: { connectorId: 'vina', status: 'LIVE' },
            dockingViewPngBase64:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lhQ3TAAAAABJRU5ErkJggg==',
          },
          construct: {
            fasta: '>construct_run_1\nYLQPRTFLL\n',
            json: { selectedCandidateIds: ['candidate-1'] },
            optimization: { method: 'genetic-algorithm', selectedCandidateIds: ['candidate-1'] },
          },
          evidence: {
            evidenceGraph: { nodes: [{ id: 'candidate-1' }], edges: [] },
            workflowTrace: { stages: [{ stageKey: 'ranking', status: 'SUCCEEDED' }] },
            agentTrace: { steps: [{ agentId: 'ranking', decision: 'CONTINUE' }] },
            approvals: [{ approvalType: 'SHORTLIST', decision: 'APPROVED' }],
            auditEvents: [{ eventType: 'artifact.created' }],
          },
          reports: {
            summaryMarkdown: '# Persisted Summary\n',
            report: { runId: 'run-1', candidateCount: 1 },
            limitationsMarkdown: '# Limitations\n',
            reportCsv: 'candidateId,peptide\ncandidate-1,YLQPRTFLL\n',
          },
        },
      },
      createContext(),
    );

    expect(result).toMatchObject({ ok: true });
    if (typeof result === 'object' && result !== null && 'data' in result) {
      const data = result.data as { artifact: { contentBase64: string } };
      const zip = Buffer.from(data.artifact.contentBase64, 'base64');
      const zipListing = zip.toString('latin1');
      for (const requiredEntry of [
        'manifest.json',
        'project.json',
        'run.json',
        'configuration.json',
        'inputs/original-fasta.fasta',
        'inputs/normalized-sequence.json',
        'inputs/input-checksums.json',
        'predictions/mhci.json',
        'predictions/mhcii.json',
        'predictions/bcell.json',
        'predictions/population-coverage.json',
        'predictions/connector-provenance.json',
        'candidates/ranked-candidates.json',
        'candidates/shortlisted-candidates.json',
        'candidates/rejected-candidates.json',
        'candidates/candidate-evidence-links.json',
        'candidates/candidates.csv',
        'structure/structures.json',
        'structure/epitope-structure-map.json',
        'structure/surface-accessibility.json',
        'structure/structure-confidence.json',
        'compounds/compounds.json',
        'compounds/descriptors.json',
        'compounds/ligand-preparation.json',
        'docking/receptor.pdbqt',
        'docking/ligand.pdbqt',
        'docking/docking-output.pdbqt',
        'docking/docking-poses.json',
        'docking/docking-summary.json',
        'docking/docking-provenance.json',
        'docking/docking-view.png',
        'construct/construct.fasta',
        'construct/construct.json',
        'construct/construct-optimization.json',
        'evidence/evidence-graph.json',
        'evidence/workflow-trace.json',
        'evidence/agent-trace.json',
        'evidence/approvals.json',
        'evidence/audit-events.json',
        'reports/summary.md',
        'reports/report.json',
        'reports/limitations.md',
        'reports/report.csv',
        'checksums.json',
      ]) {
        expect(zipListing).toContain(requiredEntry);
      }
      expect(zipListing).toContain('Persisted Immunology Project');
      expect(zipListing).toContain('YLQPRTFLL');
      expect(zipListing).toContain('genetic-algorithm');
      expect(zipListing).toContain('SHORTLIST');
    }
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

  it('executes real live-capable structure, chemistry, and docking adapters when HTTP and CLI runtimes are available', async () => {
    const structureCommandCalls: Array<{ command: string; args: string[] }> = [];
    const structureController = (
      new StructureController() as unknown as {
        useRuntime(runtime: {
          fetchText(url: string): Promise<string>;
          fetchJson(url: string): Promise<unknown>;
          runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
        }): StructureController;
      }
    ).useRuntime({
      fetchText: async (url) => {
        expect(url).toBe('https://files.rcsb.org/download/1ABC.pdb');
        return [
          'HEADER    TEST STRUCTURE',
          'ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00 10.00           N',
          'ATOM      2  CA  GLY A   1       1.000   0.000   0.000  1.00 10.00           C',
          'END',
        ].join('\n');
      },
      fetchJson: async () => ({}),
      runCommand: async (command, args) => {
        structureCommandCalls.push({ command, args });
        return {
          stdout:
            command === 'freesasa'
              ? '1 A 1 0.42'
              : ['Pocket 1 :', '\tScore : \t12.5', '\tDruggability Score : \t0.61'].join('\n'),
          stderr: '',
        };
      },
    });
    const structureTools = buildTools(structureController as unknown as Record<string, unknown>);
    const structureTool = structureTools.find((tool) => tool.name === 'fetch_structure');
    const structure = await structureTool?.execute(
      {
        runId: 'run-1',
        targetId: 'target-1',
        source: 'RCSB_PDB',
        accession: '1ABC',
        fallbackPolicy: 'LIVE_ONLY',
      },
      createContext(),
    );
    expect(structure).toMatchObject({
      ok: true,
      data: {
        structure: {
          sourceStatus: 'LIVE',
          format: 'PDB',
          scientificUse: true,
        },
        provenance: {
          connectorId: 'rcsb-pdb',
          status: 'LIVE',
          scientificUse: true,
        },
      },
    });

    const alphafoldUrls: string[] = [];
    const alphafoldController = new StructureController().useRuntime({
      fetchText: async (url) => {
        alphafoldUrls.push(url);
        if (url.endsWith('model_v6.pdb')) {
          throw new Error('not found');
        }
        return [
          'HEADER    ALPHAFOLD TEST STRUCTURE',
          'ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00 10.00           N',
          'END',
        ].join('\n');
      },
      fetchJson: async () => ({}),
      runCommand: async () => ({ stdout: '', stderr: '' }),
    });
    const alphafoldTool = buildTools(
      alphafoldController as unknown as Record<string, unknown>,
    ).find((tool) => tool.name === 'fetch_structure');
    const alphafoldStructure = await alphafoldTool?.execute(
      {
        runId: 'run-1',
        targetId: 'target-1',
        source: 'ALPHAFOLD_DB',
        accession: 'P69905',
        fallbackPolicy: 'LIVE_ONLY',
      },
      createContext(),
    );
    expect(alphafoldUrls).toEqual([
      'https://alphafold.ebi.ac.uk/files/AF-P69905-F1-model_v6.pdb',
      'https://alphafold.ebi.ac.uk/files/AF-P69905-F1-model_v4.pdb',
    ]);
    expect(alphafoldStructure).toMatchObject({
      ok: true,
      data: {
        structure: { sourceStatus: 'LIVE', artifactRef: alphafoldUrls[1] },
        provenance: { connectorId: 'alphafold-db', status: 'LIVE' },
      },
    });

    const accessibility = await structureTools
      .find((tool) => tool.name === 'calculate_surface_accessibility')
      ?.execute(
        {
          runId: 'run-1',
          method: 'freesasa',
          mappings: [
            {
              candidateId: 'candidate-1',
              structureId: '1ABC',
              chainId: 'A',
              start: 1,
              end: 9,
            },
          ],
        },
        createContext(),
      );
    expect(structureCommandCalls.some((call) => call.command === 'freesasa')).toBe(true);
    expect(structureCommandCalls.find((call) => call.command === 'freesasa')?.args).toEqual([
      '1ABC',
      '--mappings',
      JSON.stringify([
        {
          candidateId: 'candidate-1',
          structureId: '1ABC',
          chainId: 'A',
          start: 1,
          end: 9,
        },
      ]),
    ]);
    expect(accessibility).toMatchObject({
      ok: true,
      data: {
        accessibility: [{ status: 'CALCULATED', surfaceAccessibility: 0.42 }],
        provenance: { connectorId: 'freesasa', status: 'LIVE', scientificUse: true },
      },
    });

    const pockets = await structureTools
      .find((tool) => tool.name === 'detect_binding_pockets')
      ?.execute(
        {
          runId: 'run-1',
          structureId: '1ABC',
          structureArtifactRef: '1ABC.pdb',
          method: 'fpocket',
        },
        createContext(),
      );
    expect(structureCommandCalls.some((call) => call.command === 'fpocket')).toBe(true);
    expect(pockets).toMatchObject({
      ok: true,
      data: {
        pockets: [{ pocketId: '1ABC-pocket-1', score: 12.5, druggabilityScore: 0.61 }],
        provenance: { connectorId: 'fpocket', status: 'LIVE', scientificUse: true },
      },
    });

    const molstar = await structureTools
      .find((tool) => tool.name === 'create_molstar_view')
      ?.execute(
        {
          runId: 'run-1',
          viewId: 'view-1',
          structureArtifactRef: '1ABC.pdb',
          ligandArtifactRef: 'ligand.pdbqt',
          mode: 'DOCKING',
        },
        createContext(),
      );
    expect(molstar).toMatchObject({
      ok: true,
      data: {
        viewer: {
          viewer: 'Mol*',
          sourceStatus: 'LIVE',
          scientificUse: true,
        },
        provenance: { connectorId: 'molstar', status: 'LIVE', scientificUse: true },
      },
    });

    const chemistryCommandCalls: Array<{ command: string; args: string[] }> = [];
    const chemistryController = (
      new ChemistryController() as unknown as {
        useRuntime(runtime: {
          fetchText(url: string): Promise<string>;
          fetchJson(url: string): Promise<unknown>;
          runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
        }): ChemistryController;
      }
    ).useRuntime({
      fetchText: async () => '',
      fetchJson: async (url) => {
        expect(url).toContain('/rest/pug/compound/cid/2244/property/');
        return {
          PropertyTable: {
            Properties: [
              { CID: 2244, Title: 'Aspirin', IsomericSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O' },
            ],
          },
        };
      },
      runCommand: async (command, args) => {
        chemistryCommandCalls.push({ command, args });
        return {
          stdout:
            command === 'python'
              ? '{"heavyAtomCount":13,"heteroAtomCount":4,"aromaticRingEstimate":1,"rotatableBondEstimate":3}'
              : 'PDBQT ligand',
          stderr: '',
        };
      },
    });
    const chemistryTools = buildTools(chemistryController as unknown as Record<string, unknown>);
    const compoundTool = chemistryTools.find((tool) => tool.name === 'fetch_compound');
    const compound = await compoundTool?.execute(
      {
        runId: 'run-1',
        compoundRef: '2244',
        source: 'PUBCHEM',
        fallbackPolicy: 'LIVE_ONLY',
      },
      createContext(),
    );
    expect(compound).toMatchObject({
      ok: true,
      data: {
        compound: {
          sourceStatus: 'LIVE',
          name: 'Aspirin',
          smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',
          scientificUse: true,
        },
        provenance: {
          connectorId: 'pubchem',
          status: 'LIVE',
          scientificUse: true,
        },
      },
    });

    const descriptors = await chemistryTools
      .find((tool) => tool.name === 'calculate_molecular_descriptors')
      ?.execute(
        {
          runId: 'run-1',
          compoundId: '2244',
          smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',
          method: 'rdkit',
        },
        createContext(),
      );
    expect(chemistryCommandCalls.some((call) => call.command === 'python')).toBe(true);
    expect(descriptors).toMatchObject({
      ok: true,
      data: {
        descriptors: { heavyAtomCount: 13, heteroAtomCount: 4 },
        provenance: { connectorId: 'rdkit', status: 'LIVE', scientificUse: true },
      },
    });

    const ligand = await chemistryTools
      .find((tool) => tool.name === 'prepare_ligand')
      ?.execute(
        {
          runId: 'run-1',
          compoundId: '2244',
          smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',
          preparationMethod: 'openbabel-pdbqt',
        },
        createContext(),
      );
    expect(chemistryCommandCalls.some((call) => call.command === 'obabel')).toBe(true);
    expect(ligand).toMatchObject({
      ok: true,
      data: {
        ligandId: '2244-ligand',
        format: 'PDBQT',
        sourceStatus: 'LIVE',
        scientificUse: true,
        provenance: { connectorId: 'open-babel', status: 'LIVE', scientificUse: true },
      },
    });

    const commandCalls: Array<{ command: string; args: string[] }> = [];
    const dockingController = (
      new DockingController() as unknown as {
        useRuntime(runtime: {
          fetchText(url: string): Promise<string>;
          fetchJson(url: string): Promise<unknown>;
          runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
        }): DockingController;
      }
    ).useRuntime({
      fetchText: async () => '',
      fetchJson: async () => ({}),
      runCommand: async (command, args) => {
        commandCalls.push({ command, args });
        return {
          stdout: [
            '-----+------------+----------+----------',
            '   1       -7.4      0.000      0.000',
            '   2       -6.9      1.200      2.100',
          ].join('\n'),
          stderr: '',
        };
      },
    });
    const dockingTools = buildTools(dockingController as unknown as Record<string, unknown>);
    const receptor = await dockingTools
      .find((tool) => tool.name === 'prepare_receptor')
      ?.execute(
        {
          runId: 'run-1',
          structureId: '1ABC.pdb',
          chainIds: ['A'],
          preparationMethod: 'openbabel-receptor-pdbqt',
        },
        createContext(),
      );
    expect(commandCalls.some((call) => call.command === 'obabel')).toBe(true);
    expect(receptor).toMatchObject({
      ok: true,
      data: { format: 'PDBQT', sourceStatus: 'LIVE', scientificUse: true },
    });

    const dockingTool = dockingTools.find((tool) => tool.name === 'run_docking');
    const docking = await dockingTool?.execute(
      {
        runId: 'run-1',
        receptorId: 'receptor.pdbqt',
        ligandId: 'ligand.pdbqt',
        dockingBoxId: 'box-1',
        mode: 'VINA',
        fallbackPolicy: 'LIVE_ONLY',
      },
      createContext(),
    );
    expect(commandCalls.some((call) => call.command === 'vina')).toBe(true);
    expect(docking).toMatchObject({
      ok: true,
      data: {
        dockingRun: {
          sourceStatus: 'LIVE',
          scientificUse: true,
        },
        poses: [
          { rank: 1, affinityKcalMol: -7.4, rmsdLowerBound: 0, rmsdUpperBound: 0 },
          { rank: 2, affinityKcalMol: -6.9, rmsdLowerBound: 1.2, rmsdUpperBound: 2.1 },
        ],
        provenance: {
          connectorId: 'autodock-vina',
          status: 'LIVE',
          scientificUse: true,
        },
      },
    });

    const interactions = await dockingTools
      .find((tool) => tool.name === 'extract_interactions')
      ?.execute(
        {
          runId: 'run-1',
          dockingRunId: 'receptor.pdbqt-ligand.pdbqt-box-1',
          representativePoseIds: ['receptor.pdbqt-ligand.pdbqt-box-1-pose-1'],
          method: 'plip',
        },
        createContext(),
      );
    expect(commandCalls.some((call) => call.command === 'plip')).toBe(true);
    expect(interactions).toMatchObject({
      ok: true,
      data: {
        interactions: [{ interactionType: 'HYDROGEN_BOND' }],
        provenance: { connectorId: 'plip', status: 'LIVE', scientificUse: true },
      },
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
