import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { McpReportGenerationPort } from './mcp-report-generation-port.js';

const runId = 'run-1';
const projectId = 'project-1';
const proteinInputId = 'protein-1';
const snapshotHash = 'a'.repeat(64);
const now = new Date('2026-07-25T00:00:00.000Z');
const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

describe('McpReportGenerationPort', () => {
  it('passes persisted run snapshot data to the MCP research package export tool', async () => {
    const gatewayCalls: Array<{ toolName: string; input: Record<string, unknown> }> = [];
    const gateway = {
      assertAvailable: vi.fn(async () => undefined),
      call: vi.fn(async (toolName: string, input: unknown) => {
        gatewayCalls.push({ toolName, input: input as Record<string, unknown> });
        if (toolName === 'generate_report') {
          const content = Buffer.from('{"report":true}', 'utf8');
          return {
            data: {
              artifacts: [
                {
                  artifactId: 'mcp-report-json',
                  mediaType: 'application/json',
                  sha256: createHash('sha256').update(content).digest('hex'),
                  byteLength: content.byteLength,
                  reference: 'mcp://reports/run-1/json',
                  contentBase64: content.toString('base64'),
                },
              ],
              disclaimer: 'research only',
              provenanceSummary: {},
              runQuality: 'COMPLETE',
            },
            meta: mcpMeta('generate_report'),
          };
        }
        if (toolName === 'export_research_package') {
          return {
            data: {
              artifact: {
                artifactId: 'mcp-research-package',
                mediaType: 'application/zip',
                sha256: createHash('sha256').update(zipBytes).digest('hex'),
                byteLength: zipBytes.byteLength,
                reference: 'mcp://research-packages/run-1/research-package.zip',
                contentBase64: zipBytes.toString('base64'),
              },
              requiredSections: ['manifest.json', 'reports/report.csv'],
              includesCsvExports: true,
              includesAgentTrace: true,
            },
            meta: mcpMeta('export_research_package'),
          };
        }
        throw new Error(`Unexpected MCP tool: ${toolName}`);
      }),
    };
    const artifactStore = {
      write: vi.fn(async (relativePath: string, body: string, mimeType: string) => ({
        relativePath,
        byteSize: Buffer.byteLength(body, 'utf8'),
        sha256: createHash('sha256').update(body).digest('hex'),
        mimeType,
      })),
      writeBytes: vi.fn(async (relativePath: string, bytes: Buffer, mimeType: string) => ({
        relativePath,
        byteSize: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mimeType,
      })),
    };
    const repositories = createRepositories();
    const fallback = { assertAvailable: vi.fn(), generate: vi.fn() };

    const port = new McpReportGenerationPort(
      repositories as never,
      artifactStore as never,
      gateway as never,
      fallback,
    );

    await port.generate({
      runId,
      requestId: 'request-1',
      options: {
        formats: ['JSON'],
        templateVersion: 'template-v1',
        includeEvidenceGraph: true,
        includeWorkflowTrace: true,
      },
    });

    const packageCall = gatewayCalls.find(({ toolName }) => toolName === 'export_research_package');
    expect(packageCall).toBeDefined();
    expect(packageCall?.input).toMatchObject({
      runId,
      includeStructure: true,
      includeChemistry: true,
      includeDocking: true,
      includeAgentTrace: true,
      packageSnapshot: {
        project: { id: projectId, name: 'Persisted Project' },
        run: { id: runId, executionMode: 'HYBRID' },
        originalFasta: '>demo\nYLQPRTFLL\n',
      },
    });
    expect(JSON.stringify(packageCall?.input)).toContain('YLQPRTFLL');
    expect(JSON.stringify(packageCall?.input)).toContain('SHORTLIST');
    expect(artifactStore.writeBytes).toHaveBeenCalledWith(
      expect.stringContaining('research-package-'),
      zipBytes,
      'application/zip',
    );
  });
});

function createRepositories() {
  const candidate = {
    id: 'candidate-1',
    runId,
    peptide: 'YLQPRTFLL',
    candidateType: 'MHCI',
    start: 1,
    end: 9,
    allele: 'HLA-A*02:01',
    createdAt: now,
  };
  const ranking = {
    id: 'ranking-1',
    runId,
    candidateId: candidate.id,
    rankingSnapshotHash: snapshotHash,
    rank: 1,
    track: 'T_CELL',
    finalScore: 0.91,
    category: 'RECOMMENDED',
    confidence: 0.82,
    createdAt: now,
  };
  const predictorExecution = {
    id: 'predictor-1',
    runId,
    connectorId: 'iedb',
    sourceStatus: 'LIVE',
    method: 'mhci',
    createdAt: now,
  };
  const observation = {
    id: 'obs-1',
    runId,
    candidateId: candidate.id,
    predictorExecutionId: predictorExecution.id,
    scoreType: 'percentile_rank',
    value: 0.12,
    createdAt: now,
  };

  return {
    runs: {
      findById: async () => ({
        id: runId,
        projectId,
        proteinInputId,
        executionMode: 'HYBRID',
        quality: 'COMPLETE',
        configurationJson: JSON.stringify({ requestedExecutionMode: 'HYBRID' }),
        createdAt: now,
      }),
    },
    projects: { findById: async () => ({ id: projectId, name: 'Persisted Project' }) },
    proteins: {
      findById: async () => ({
        id: proteinInputId,
        originalFasta: '>demo\nYLQPRTFLL\n',
        normalizedSequence: 'YLQPRTFLL',
        sequenceLength: 9,
        sha256: 'b'.repeat(64),
        header: 'demo',
        validationProfileVersion: 'mvp-v1.0',
        createdAt: now,
      }),
    },
    candidates: {
      listByRun: async () => [candidate],
      findDetail: async () => ({
        candidate: {
          ...candidate,
          predictionObservations: [{ ...observation, predictorExecution }],
          constraintOutcomes: [],
          evidenceSummaries: [],
        },
      }),
    },
    rankingResults: {
      findLatestSnapshotHash: async () => snapshotHash,
      findSnapshot: async () => [ranking],
    },
    predictorExecutions: { listByRun: async () => [predictorExecution] },
    observations: { listByRun: async () => [observation] },
    populationCoverageResults: {
      listByRun: async () => [{ id: 'coverage-1', runId, population: 'India', coverage: 0.62 }],
    },
    shortlistOptimizationResults: {
      listByRun: async () => [{ id: 'optimization-1', runId, method: 'genetic-algorithm' }],
    },
    approvals: {
      listByRun: async () => [{ id: 'approval-1', runId, approvalType: 'SHORTLIST' }],
    },
    graphNodes: {
      listByRun: async () => [
        {
          id: 'node-1',
          runId,
          nodeType: 'CANDIDATE',
          entityId: candidate.id,
          label: 'Candidate',
          propertiesJson: '{}',
          createdAt: now,
        },
      ],
    },
    graphEdges: { listByRun: async () => [] },
    stages: {
      listByRun: async () => [
        {
          id: 'stage-1',
          runId,
          stageKey: 'ranking',
          attempt: 1,
          status: 'SUCCEEDED',
          dependencyKeysJson: '[]',
          inputHash: 'e'.repeat(64),
          outputHash: 'f'.repeat(64),
          progress: 1,
          startedAt: now,
          completedAt: now,
          createdAt: now,
        },
      ],
    },
    events: {
      listByRun: async () => [
        {
          id: 'event-1',
          runId,
          sequenceNumber: 1,
          eventType: 'artifact.created',
          level: 'INFO',
          message: 'Artifact created',
          payloadJson: '{}',
          stageId: 'stage-1',
          createdAt: now,
        },
      ],
    },
    artifacts: {
      create: vi.fn(async (input: Record<string, unknown>) => ({
        id: `artifact-${input.format ?? 'unknown'}`,
        createdAt: now,
        ...input,
      })),
    },
  };
}

function mcpMeta(toolName: string) {
  return {
    requestId: 'request-1',
    runId,
    toolName,
    toolVersion: '1.0.0',
    startedAt: '2026-07-25T00:00:00.000Z',
    completedAt: '2026-07-25T00:00:00.001Z',
    durationMs: 1,
    inputHash: 'c'.repeat(64),
    outputHash: 'd'.repeat(64),
  };
}
