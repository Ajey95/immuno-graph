import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createServices } from './create-services.js';
import { createMigratedTestDatabase } from './test-context.test-support.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('inline synthetic fixture workflow', () => {
  it('persists candidates, evidence, rankings, coverage, and provenance', async () => {
    const database = await createMigratedTestDatabase();
    const artifactRoot = await mkdtemp(join(tmpdir(), 'immunograph-fixture-workflow-'));
    cleanups.push(database.cleanup, () => rm(artifactRoot, { recursive: true, force: true }));
    const services = createServices(database.client, {
      API_HOST: '127.0.0.1',
      API_LOG_LEVEL: 'silent',
      API_PORT: 3000,
      APPLICATION_VERSION: '0.1.0',
      ARTIFACT_ROOT: artifactRoot,
      DATABASE_URL: database.databaseUrl,
      DEMO_MODE: true,
      LLM_ENABLED: false,
      NODE_ENV: 'test',
      SPECIFICATION_VERSION: '0.7.0-draft',
    });
    const context = { requestId: 'fixture-workflow-test' };
    const created = (await services.execute(
      'projects.create',
      {
        name: 'Synthetic fixture replay',
        organism: 'Synthetic demonstration',
        proteinName: 'Synthetic protein',
        fasta:
          '>SYNTHETIC_DEMO covid-spike UI scenario; not a pathogen reference sequence\nACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY',
      },
      context,
    )) as { project: { id: string } };
    const draft = (await services.execute(
      'runs.create',
      {
        projectId: created.project.id,
        analysis: {
          mhci: {
            enabled: true,
            alleles: ['HLA-A*02:01'],
            peptideLengths: [9, 10],
            methods: ['iedb-recommended'],
          },
          mhcii: {
            enabled: true,
            alleles: ['HLA-DRB1*04:01'],
            peptideLengths: [15],
            methods: ['iedb-recommended'],
          },
          bcell: { enabled: true, methods: ['graphbepi'] },
        },
        populations: ['synthetic-population-alpha', 'synthetic-population-beta'],
        fallbackPolicy: 'FIXTURE_ONLY',
        ruleProfileVersion: 'mvp-v1.0',
        rankingProfileVersion: 'mvp-v1.0',
        outputPreferences: {
          formats: ['JSON'],
          templateVersion: 'mvp-v1.0',
          includeWorkflowTrace: true,
          includeEvidenceGraph: true,
        },
      },
      context,
    )) as { id: string; configurationHash: string };
    await services.execute(
      'runs.approveConfiguration',
      {
        runId: draft.id,
        decision: 'APPROVE',
        expectedConfigurationHash: draft.configurationHash,
      },
      context,
    );

    const started = (await services.execute('runs.start', { runId: draft.id }, context)) as {
      status: string;
      quality: string;
      connectors: Array<{ sourceStatus: string }>;
    };
    const candidates = (await services.execute(
      'candidates.list',
      { runId: draft.id, sort: 'rank', limit: 20 },
      context,
    )) as {
      items: Array<{ id: string; sourceMix: string[]; finalScore: number; category: string }>;
      rankingSnapshotHash: string;
    };
    const coverage = (await services.execute(
      'visualizations.get',
      { runId: draft.id, type: 'population-coverage' },
      context,
    )) as { populations: unknown[] };
    const workflow = (await services.execute('graphs.workflow', { runId: draft.id }, context)) as {
      nodes: Array<{ id: string; position: { x: number; y: number } }>;
      edges: Array<{ source: string; target: string }>;
    };
    const evidence = (await services.execute(
      'graphs.evidence',
      { runId: draft.id, depth: 2 },
      context,
    )) as {
      nodes: Array<{ type: string }>;
      edges: Array<{ relation: string }>;
    };

    expect(started).toMatchObject({
      status: 'AWAITING_SHORTLIST_APPROVAL',
      quality: 'FIXTURE_ONLY',
    });
    expect(started.connectors.length).toBe(3);
    expect(started.connectors.every(({ sourceStatus }) => sourceStatus === 'FIXTURE')).toBe(true);
    expect(candidates.items).toHaveLength(3);
    expect(candidates.items.every(({ sourceMix }) => sourceMix.includes('FIXTURE'))).toBe(true);
    expect(candidates.items.every(({ finalScore }) => finalScore > 0)).toBe(true);
    expect(coverage.populations.length).toBeGreaterThan(0);
    expect(workflow.nodes.length).toBeGreaterThanOrEqual(12);
    expect(workflow.edges.length).toBeGreaterThanOrEqual(11);
    expect(new Set(workflow.nodes.map(({ position }) => `${position.x}:${position.y}`)).size).toBe(
      workflow.nodes.length,
    );
    expect(evidence.nodes.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        'PROTEIN',
        'CANDIDATE',
        'PREDICTION_OBSERVATION',
        'TOOL_VERSION',
        'EVIDENCE_SUMMARY',
        'CONSTRAINT_RULE',
        'RANKING_RESULT',
        'COVERAGE_RESULT',
      ]),
    );
    expect(evidence.nodes.length).toBeGreaterThanOrEqual(18);
    expect(evidence.edges.length).toBeGreaterThanOrEqual(18);

    await services.execute(
      'runs.approveShortlist',
      {
        runId: draft.id,
        decision: 'APPROVE',
        expectedRankingSnapshotHash: candidates.rankingSnapshotHash,
        approvedCandidateIds: candidates.items
          .filter(({ category }) => category !== 'REJECTED')
          .map(({ id }) => id),
        excludedCandidateIds: [],
      },
      context,
    );
    await services.execute(
      'reports.create',
      {
        runId: draft.id,
        formats: ['JSON'],
        templateVersion: 'mvp-v1.0',
        includeWorkflowTrace: true,
        includeEvidenceGraph: true,
      },
      context,
    );
    const artifacts = (await services.execute('artifacts.list', { runId: draft.id }, context)) as {
      items: Array<{ type: string }>;
    };
    expect(artifacts.items.map(({ type }) => type).sort()).toEqual([
      'EVIDENCE_GRAPH',
      'JSON',
      'RESEARCH_PACKAGE',
      'WORKFLOW_TRACE',
    ]);
  }, 60_000);
});
