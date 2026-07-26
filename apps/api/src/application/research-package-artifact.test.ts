import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createResearchPackageArtifact } from './research-package-artifact.js';

const runId = 'run-1';
const projectId = 'project-1';
const proteinInputId = 'protein-1';
const snapshotHash = 'a'.repeat(64);
const now = new Date('2026-07-25T00:00:00.000Z');

describe('createResearchPackageArtifact', () => {
  it('creates the mandatory research-package zip with checksums and CSV reports', async () => {
    let zipBytes: Buffer | null = null;
    const artifactStore = {
      writeBytes: vi.fn(async (_relativePath: string, bytes: Buffer, mimeType: string) => {
        zipBytes = bytes;
        return {
          relativePath: 'run-1/research-package.zip',
          byteSize: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          mimeType,
        };
      }),
    };
    const createdArtifact = {
      id: 'artifact-package',
      runId,
      type: 'RESEARCH_PACKAGE',
      format: 'ZIP',
      relativePath: 'run-1/research-package.zip',
      mimeType: 'application/zip',
      byteSize: 1,
      sha256: 'b'.repeat(64),
      createdAt: now,
    };
    const repositories = {
      runs: {
        findById: async () => ({
          id: runId,
          projectId,
          proteinInputId,
          revision: 1,
          status: 'COMPLETED',
          quality: 'COMPLETE',
          configurationJson: JSON.stringify({
            request: {
              outputPreferences: {
                formats: ['JSON', 'CSV'],
                templateVersion: 'v1',
                includeEvidenceGraph: true,
                includeWorkflowTrace: true,
              },
            },
          }),
          configurationHash: 'c'.repeat(64),
          ruleProfileVersion: 'mvp-v1.0',
          rankingProfileVersion: 'mvp-v1.0',
          requestedExecutionMode: 'AUTO',
          executionMode: 'SYNTHETIC',
          replayHash: 'd'.repeat(64),
          createdAt: now,
          startedAt: now,
          completedAt: now,
          updatedAt: now,
        }),
      },
      projects: {
        findById: async () => ({
          id: projectId,
          name: 'Demo project',
          organism: 'Synthetic demonstration',
          proteinName: 'Demo protein',
          description: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
      proteins: {
        findById: async () => ({
          id: proteinInputId,
          projectId,
          originalFasta: '>demo\nACDEFGHIK',
          header: 'demo',
          normalizedSequence: 'ACDEFGHIK',
          sequenceLength: 9,
          sha256: 'e'.repeat(64),
          validationProfileVersion: 'mvp-v1.0',
          createdAt: now,
        }),
      },
      candidates: {
        listByRun: async () => [
          {
            id: 'candidate-1',
            runId,
            candidateKey: 'key-1',
            candidateType: 'MHCI',
            peptide: 'ACDEFGHIK',
            start: 1,
            end: 9,
            length: 9,
            allele: 'HLA-A*02:01',
            createdAt: now,
          },
        ],
        findDetail: async () => ({
          candidate: {
            id: 'candidate-1',
            candidateKey: 'key-1',
            candidateType: 'MHCI',
            peptide: 'ACDEFGHIK',
            start: 1,
            end: 9,
            length: 9,
            allele: 'HLA-A*02:01',
            predictionObservations: [
              {
                id: 'obs-1',
                rawScoresJson: '{"score":0.4}',
                unitsJson: '{"score":"percentile"}',
                predictorExecution: {
                  id: 'exec-1',
                  connectorId: 'immunograph-synthetic-predictor',
                  sourceStatus: 'SYNTHETIC',
                },
              },
            ],
            constraintOutcomes: [],
            evidenceSummaries: [],
          },
          ranking: {
            candidateId: 'candidate-1',
            rank: 1,
            track: 'MHCI',
            finalScore: 0.8,
            category: 'RECOMMENDED',
            confidence: 0.7,
            componentScoresJson: '{"binding":0.8}',
            penaltiesJson: '{}',
          },
        }),
      },
      rankingResults: {
        findLatestSnapshotHash: async () => snapshotHash,
        findSnapshot: async () => [
          {
            id: 'rank-1',
            runId,
            candidateId: 'candidate-1',
            snapshotHash,
            profileVersion: 'mvp-v1.0',
            track: 'MHCI',
            componentScoresJson: '{"binding":0.8}',
            penaltiesJson: '{}',
            finalScore: 0.8,
            category: 'RECOMMENDED',
            confidence: 0.7,
            rank: 1,
            createdAt: now,
          },
        ],
      },
      predictorExecutions: { listByRun: async () => [] },
      observations: { listByRun: async () => [] },
      populationCoverageResults: { listByRun: async () => [] },
      shortlistOptimizationResults: { listByRun: async () => [] },
      approvals: {
        listByRun: async () => [
          {
            id: 'approval-1',
            runId,
            type: 'SHORTLIST',
            status: 'APPROVED',
            snapshotHash,
            selectionJson: '["candidate-1"]',
            note: 'approved',
            createdAt: now,
          },
        ],
      },
      graphNodes: { listByRun: async () => [] },
      graphEdges: { listByRun: async () => [] },
      stages: { listByRun: async () => [] },
      events: { listByRun: async () => [] },
      artifacts: {
        create: vi.fn(async () => createdArtifact),
      },
    };

    await createResearchPackageArtifact(repositories as never, artifactStore as never, {
      runId,
      rankingSnapshotHash: snapshotHash,
      requestSuffix: 'request-1',
      templateVersion: 'v1',
      generatedAt: now,
    });

    expect(zipBytes).not.toBeNull();
    expect(zipBytes).toBeInstanceOf(Buffer);
    const entries = unzipStoredEntries(zipBytes as unknown as Buffer);
    expect([...entries.keys()].sort()).toEqual(
      [
        'candidates/candidate-evidence-links.json',
        'candidates/candidates.csv',
        'candidates/ranked-candidates.json',
        'candidates/rejected-candidates.json',
        'candidates/shortlisted-candidates.json',
        'checksums.json',
        'configuration.json',
        'construct/construct-optimization.json',
        'construct/construct.fasta',
        'construct/construct.json',
        'docking/docking-output.pdbqt',
        'docking/docking-poses.json',
        'docking/docking-provenance.json',
        'docking/docking-summary.json',
        'docking/docking-view.png',
        'docking/ligand.pdbqt',
        'docking/receptor.pdbqt',
        'evidence/approvals.json',
        'evidence/audit-events.json',
        'evidence/evidence-graph.json',
        'evidence/workflow-trace.json',
        'inputs/input-checksums.json',
        'inputs/normalized-sequence.json',
        'inputs/original-fasta.fasta',
        'manifest.json',
        'predictions/bcell.json',
        'predictions/connector-provenance.json',
        'predictions/mhci.json',
        'predictions/mhcii.json',
        'predictions/population-coverage.json',
        'project.json',
        'reports/limitations.md',
        'reports/report.csv',
        'reports/report.json',
        'reports/summary.md',
        'run.json',
      ].sort(),
    );
    expect(entries.get('reports/report.csv')?.toString('utf8')).toContain('candidateId');
    expect(entries.get('candidates/candidates.csv')?.toString('utf8')).toContain('ACDEFGHIK');
    expect(entries.get('docking/receptor.pdbqt')?.toString('utf8')).toContain('REMARK');
    expect(entries.get('docking/ligand.pdbqt')?.toString('utf8')).toContain('ROOT');
    expect(entries.get('docking/docking-output.pdbqt')?.toString('utf8')).toContain('MODEL 1');
    expect(JSON.parse(entries.get('docking/docking-summary.json')!.toString('utf8'))).toMatchObject(
      {
        schemaVersion: 'immunograph-docking-summary.v1',
        sourceStatus: 'FIXTURE',
        scientificUse: false,
      },
    );
    expect(entries.get('docking/docking-view.png')?.subarray(0, 8).toString('hex')).toBe(
      '89504e470d0a1a0a',
    );
    const checksums = JSON.parse(entries.get('checksums.json')!.toString('utf8')) as Record<
      string,
      string
    >;
    expect(checksums['manifest.json']).toMatch(/^[a-f0-9]{64}$/);
    expect(checksums['reports/report.csv']).toMatch(/^[a-f0-9]{64}$/);
    expect(checksums['docking/docking-view.png']).toMatch(/^[a-f0-9]{64}$/);
    expect(artifactStore.writeBytes).toHaveBeenCalledWith(
      expect.stringContaining('research-package-'),
      expect.any(Buffer),
      'application/zip',
    );
  });
});

function unzipStoredEntries(zip: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset < zip.length) {
    const signature = zip.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const compressedSize = zip.readUInt32LE(offset + 18);
    const fileNameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = zip.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    entries.set(name, zip.subarray(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  return entries;
}
