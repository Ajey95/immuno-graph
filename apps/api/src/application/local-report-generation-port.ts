import { canonicalJson, type CanonicalJsonValue } from '@immunograph/algorithms';
import type { Repositories } from '@immunograph/database';

import type { ArtifactStore } from './artifact-store.js';
import { DependencyUnavailableError } from './errors.js';
import type { ReportGenerationCommand, ReportGenerationPort } from './ports.js';
import { createResearchPackageArtifact } from './research-package-artifact.js';
import { createSupplementalReportArtifacts } from './report-artifacts.js';

export class LocalReportGenerationPort implements ReportGenerationPort {
  constructor(
    private readonly repositories: Pick<
      Repositories,
      | 'runs'
      | 'projects'
      | 'proteins'
      | 'candidates'
      | 'rankingResults'
      | 'predictorExecutions'
      | 'observations'
      | 'populationCoverageResults'
      | 'shortlistOptimizationResults'
      | 'approvals'
      | 'artifacts'
      | 'events'
      | 'graphEdges'
      | 'graphNodes'
      | 'stages'
    >,
    private readonly artifactStore: ArtifactStore,
  ) {}

  assertAvailable(): Promise<void> {
    return Promise.resolve();
  }

  async generate(command: ReportGenerationCommand) {
    const run = await this.repositories.runs.findById(command.runId);
    if (run === null) throw new DependencyUnavailableError('report run');
    const snapshotHash = await this.repositories.rankingResults.findLatestSnapshotHash(
      command.runId,
    );
    if (snapshotHash === null) throw new DependencyUnavailableError('ranking snapshot');
    const rankings = await this.repositories.rankingResults.findSnapshot(
      command.runId,
      snapshotHash,
    );
    const rows = [];
    for (const ranking of rankings) {
      const detail = await this.repositories.candidates.findDetail(
        command.runId,
        ranking.candidateId,
        snapshotHash,
      );
      if (detail === null) continue;
      const statuses = detail.candidate.predictionObservations.map(
        ({ predictorExecution }) => predictorExecution.sourceStatus,
      );
      rows.push({
        rank: ranking.rank,
        track: ranking.track,
        peptide: detail.candidate.peptide,
        start: detail.candidate.start,
        end: detail.candidate.end,
        allele: detail.candidate.allele,
        finalScore: ranking.finalScore,
        category: ranking.category,
        sourceStatus: statuses.join('+'),
        scientificUse: statuses.length > 0 && statuses.every((status) => status === 'LIVE'),
      });
    }
    const created = [];
    const requestSuffix = command.requestId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36) || 'local';
    for (const format of command.options.formats) {
      const extension = format.toLowerCase();
      const relativePath = `${command.runId}/report-${snapshotHash.slice(0, 12)}-${requestSuffix}.${extension}`;
      const contents =
        format === 'JSON'
          ? canonicalJson({
              schemaVersion: 'immunograph-report.v1',
              runId: command.runId,
              quality: run.quality,
              executionMode: run.executionMode,
              rankingSnapshotHash: snapshotHash,
              sourceKind: run.executionMode ?? 'FIXTURE',
              scientificUse: run.executionMode === 'LIVE',
              disclaimer:
                run.executionMode === 'LIVE'
                  ? 'Computational predictions require independent scientific validation.'
                  : 'This analysis may include deterministic offline demonstration values. These values are not validated biological predictions.',
              candidates: rows,
            } as unknown as CanonicalJsonValue)
          : toCsv(rows);
      const mediaType = format === 'JSON' ? 'application/json' : 'text/csv';
      const file = await this.artifactStore.write(relativePath, contents, mediaType);
      created.push(
        await this.repositories.artifacts.create({
          runId: command.runId,
          type: format,
          format,
          ...file,
          templateVersion: command.options.templateVersion,
        }),
      );
    }
    await createSupplementalReportArtifacts(this.repositories, this.artifactStore, {
      runId: command.runId,
      rankingSnapshotHash: snapshotHash,
      requestSuffix,
      templateVersion: command.options.templateVersion,
      includeEvidenceGraph: command.options.includeEvidenceGraph,
      includeWorkflowTrace: command.options.includeWorkflowTrace,
    });
    await createResearchPackageArtifact(this.repositories, this.artifactStore, {
      runId: command.runId,
      rankingSnapshotHash: snapshotHash,
      requestSuffix,
      templateVersion: command.options.templateVersion,
    });
    const first = created[0];
    if (first === undefined) throw new DependencyUnavailableError('report output format');
    return { artifactJobId: first.id, status: 'QUEUED' as const };
  }
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const columns = [
    'rank',
    'track',
    'peptide',
    'start',
    'end',
    'allele',
    'finalScore',
    'category',
    'sourceStatus',
    'scientificUse',
  ];
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return `${columns.join(',')}\n${rows
    .map((row) => columns.map((column) => quote(row[column])).join(','))
    .join('\n')}\n`;
}
