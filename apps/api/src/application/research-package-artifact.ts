import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { canonicalJson, type CanonicalJsonValue } from '@immunograph/algorithms';
import type { Repositories } from '@immunograph/database';

import type { ArtifactStore } from './artifact-store.js';
import { DependencyUnavailableError } from './errors.js';
import { buildStoredZip, type ZipFileEntry } from './zip.js';

type ResearchPackageRepositories = Pick<
  Repositories,
  | 'projects'
  | 'proteins'
  | 'runs'
  | 'candidates'
  | 'rankingResults'
  | 'predictorExecutions'
  | 'observations'
  | 'populationCoverageResults'
  | 'shortlistOptimizationResults'
  | 'approvals'
  | 'graphNodes'
  | 'graphEdges'
  | 'stages'
  | 'events'
  | 'artifacts'
>;

export interface ResearchPackageOptions {
  runId: string;
  rankingSnapshotHash: string;
  requestSuffix: string;
  templateVersion: string;
  generatedAt?: Date;
}

interface PackageFile {
  path: string;
  value: unknown;
  data?: Buffer;
}

const RESEARCH_LIMITATION =
  'This package contains computational research outputs only. It is not clinical validation, vaccine efficacy evidence, treatment advice, or a replacement for experimental validation.';

const SYNTHETIC_LIMITATION =
  'This analysis includes deterministic synthetic demonstration outputs. These values are intended to demonstrate workflow orchestration and must not be interpreted as validated biological predictions.';

export async function createResearchPackageArtifact(
  repositories: ResearchPackageRepositories,
  artifactStore: ArtifactStore,
  options: ResearchPackageOptions,
) {
  const generatedAt = options.generatedAt ?? new Date();
  const run = await repositories.runs.findById(options.runId);
  if (run === null) throw new DependencyUnavailableError('research package run');
  const [project, protein] = await Promise.all([
    repositories.projects.findById(run.projectId),
    repositories.proteins.findById(run.proteinInputId),
  ]);
  if (project === null) throw new DependencyUnavailableError('research package project');
  if (protein === null) throw new DependencyUnavailableError('research package protein');

  const [
    candidates,
    rankings,
    predictorExecutions,
    observations,
    populationCoverage,
    shortlistOptimizations,
    approvals,
    graphNodes,
    graphEdges,
    stages,
    events,
  ] = await Promise.all([
    repositories.candidates.listByRun(options.runId),
    repositories.rankingResults.findSnapshot(options.runId, options.rankingSnapshotHash),
    repositories.predictorExecutions.listByRun(options.runId),
    repositories.observations.listByRun(options.runId),
    repositories.populationCoverageResults.listByRun(options.runId),
    repositories.shortlistOptimizationResults.listByRun(options.runId),
    repositories.approvals.listByRun(options.runId),
    repositories.graphNodes.listByRun(options.runId),
    repositories.graphEdges.listByRun(options.runId),
    repositories.stages.listByRun(options.runId),
    repositories.events.listByRun(options.runId),
  ]);

  const details = (
    await Promise.all(
      rankings.map((ranking) =>
        repositories.candidates.findDetail(
          options.runId,
          ranking.candidateId,
          options.rankingSnapshotHash,
        ),
      ),
    )
  ).filter((detail): detail is NonNullable<typeof detail> => detail !== null);

  const rankedCandidates: Array<Record<string, unknown>> = rankings.map((ranking) => ({
    ...plainRecord(ranking),
    candidate: plainRecord(candidates.find((candidate) => candidate.id === ranking.candidateId)),
  }));
  const shortlistedCandidateIds = new Set(
    rankedCandidates
      .filter((row) => row.category === 'RECOMMENDED')
      .map((row) => String(row.candidateId)),
  );
  const rejectedCandidates = rankedCandidates.filter((row) => row.category === 'REJECTED');
  const selectedCandidates = candidates.filter((candidate) =>
    shortlistedCandidateIds.has(candidate.id),
  );
  const constructSequence = selectedCandidates.map((candidate) => candidate.peptide).join('GGGS');
  const allProvenance = mergePredictorExecutions(predictorExecutions, details);

  const payloadFiles: PackageFile[] = [
    { path: 'project.json', value: plainRecord(project) },
    { path: 'run.json', value: plainRecord(run) },
    { path: 'configuration.json', value: parseJson(run.configurationJson) },
    { path: 'inputs/original-fasta.fasta', value: protein.originalFasta },
    {
      path: 'inputs/normalized-sequence.json',
      value: {
        id: protein.id,
        header: protein.header,
        normalizedSequence: protein.normalizedSequence,
        sequenceLength: protein.sequenceLength,
        sha256: protein.sha256,
        validationProfileVersion: protein.validationProfileVersion,
        createdAt: iso(protein.createdAt),
      },
    },
    {
      path: 'inputs/input-checksums.json',
      value: {
        originalFasta: sha256(Buffer.from(protein.originalFasta, 'utf8')),
        normalizedSequence: sha256(Buffer.from(protein.normalizedSequence, 'utf8')),
        recordedProteinSha256: protein.sha256,
      },
    },
    {
      path: 'predictions/mhci.json',
      value: predictionBundle('MHCI', observations, candidates, allProvenance),
    },
    {
      path: 'predictions/mhcii.json',
      value: predictionBundle('MHCII', observations, candidates, allProvenance),
    },
    {
      path: 'predictions/bcell.json',
      value: predictionBundle('BCELL', observations, candidates, allProvenance),
    },
    {
      path: 'predictions/population-coverage.json',
      value: populationCoverage.map(plainRecord),
    },
    { path: 'predictions/connector-provenance.json', value: allProvenance },
    { path: 'candidates/ranked-candidates.json', value: rankedCandidates },
    {
      path: 'candidates/shortlisted-candidates.json',
      value: rankedCandidates.filter((row) => row.category === 'RECOMMENDED'),
    },
    { path: 'candidates/rejected-candidates.json', value: rejectedCandidates },
    {
      path: 'candidates/candidate-evidence-links.json',
      value: candidateEvidenceLinks(details),
    },
    { path: 'candidates/candidates.csv', value: candidatesCsv(rankedCandidates) },
    { path: 'construct/construct.fasta', value: constructFasta(run.id, constructSequence) },
    {
      path: 'construct/construct.json',
      value: {
        schemaVersion: 'immunograph-construct.v1',
        runId: run.id,
        generatedAt: iso(generatedAt),
        status: constructSequence.length > 0 ? 'GENERATED_FROM_SHORTLIST' : 'NOT_GENERATED',
        linker: selectedCandidates.length > 1 ? 'GGGS' : null,
        selectedCandidateIds: selectedCandidates.map((candidate) => candidate.id),
        sequence: constructSequence,
        researchUseOnly: true,
      },
    },
    {
      path: 'construct/construct-optimization.json',
      value: shortlistOptimizations.map(plainRecord),
    },
    { path: 'docking/receptor.pdbqt', value: fixtureReceptorPdbqt(run.id) },
    { path: 'docking/ligand.pdbqt', value: fixtureLigandPdbqt(run.id) },
    { path: 'docking/docking-output.pdbqt', value: fixtureDockingOutputPdbqt(run.id) },
    {
      path: 'docking/docking-poses.json',
      value: fixtureDockingPoses(run.id, selectedCandidates),
    },
    {
      path: 'docking/docking-summary.json',
      value: fixtureDockingSummary(run.id, selectedCandidates),
    },
    {
      path: 'docking/docking-provenance.json',
      value: fixtureDockingProvenance(run.id),
    },
    {
      path: 'docking/docking-view.png',
      value: null,
      data: createFixtureDockingPreviewPng(),
    },
    {
      path: 'evidence/evidence-graph.json',
      value: {
        schemaVersion: 'immunograph-evidence-graph.v1',
        runId: run.id,
        nodes: graphNodes.map(plainRecord),
        edges: graphEdges.map(plainRecord),
      },
    },
    {
      path: 'evidence/workflow-trace.json',
      value: {
        schemaVersion: 'immunograph-workflow-trace.v1',
        runId: run.id,
        stages: stages.map(plainRecord),
        events: events.map(plainRecord),
      },
    },
    { path: 'evidence/approvals.json', value: approvals.map(plainRecord) },
    { path: 'evidence/audit-events.json', value: events.map(plainRecord) },
    { path: 'reports/summary.md', value: summaryMarkdown(run, rankedCandidates, allProvenance) },
    {
      path: 'reports/report.json',
      value: {
        schemaVersion: 'immunograph-report.v1',
        runId: run.id,
        projectId: project.id,
        generatedAt: iso(generatedAt),
        executionMode: run.executionMode,
        quality: run.quality,
        rankingSnapshotHash: options.rankingSnapshotHash,
        researchUseOnly: true,
        limitations: limitations(run.executionMode),
        candidates: rankedCandidates,
        connectorProvenance: allProvenance,
      },
    },
    { path: 'reports/limitations.md', value: limitationsMarkdown(run.executionMode) },
    { path: 'reports/report.csv', value: candidatesCsv(rankedCandidates) },
  ];

  const encodedPayloadFiles = payloadFiles.map(encodePackageFile);
  const checksums = Object.fromEntries(
    encodedPayloadFiles.map((file) => [file.path, sha256(file.data)]),
  );
  const manifest = {
    schemaVersion: 'immunograph-research-package.v1',
    packageName: 'research-package.zip',
    generatedAt: iso(generatedAt),
    applicationVersion: process.env.APPLICATION_VERSION ?? '0.1.0',
    specificationVersion: process.env.SPECIFICATION_VERSION ?? '0.8.0',
    projectId: project.id,
    runId: run.id,
    executionMode: run.executionMode ?? 'UNKNOWN',
    runQuality: run.quality ?? 'UNKNOWN',
    rankingSnapshotHash: options.rankingSnapshotHash,
    connectorStatuses: allProvenance.map((entry) => ({
      connectorId: entry.connectorId,
      method: entry.method,
      status: entry.sourceStatus ?? entry.status,
    })),
    limitations: limitations(run.executionMode),
    files: encodedPayloadFiles.map((file) => ({
      path: file.path,
      sha256: checksums[file.path],
      byteLength: file.data.byteLength,
    })),
  };
  const manifestFile = encodePackageFile({ path: 'manifest.json', value: manifest });
  const checksumsFile = encodePackageFile({
    path: 'checksums.json',
    value: {
      ...checksums,
      'manifest.json': sha256(manifestFile.data),
    },
  });
  const zip = buildStoredZip([manifestFile, ...encodedPayloadFiles, checksumsFile]);
  const relativePath = `${run.id}/research-package-${options.rankingSnapshotHash.slice(0, 12)}-${options.requestSuffix}.zip`;
  const file = await artifactStore.writeBytes(relativePath, zip, 'application/zip');
  return repositories.artifacts.create({
    runId: run.id,
    type: 'RESEARCH_PACKAGE',
    format: 'ZIP',
    ...file,
    templateVersion: options.templateVersion,
  });
}

function encodePackageFile(file: PackageFile): ZipFileEntry {
  if (file.data !== undefined) return { path: file.path, data: file.data };
  if (typeof file.value === 'string') {
    return { path: file.path, data: Buffer.from(file.value, 'utf8') };
  }
  return {
    path: file.path,
    data: Buffer.from(canonicalJson(jsonSafe(file.value) as CanonicalJsonValue), 'utf8'),
  };
}

function predictionBundle(
  candidateType: string,
  observations: readonly unknown[],
  candidates: ReadonlyArray<{ id: string; candidateType: string }>,
  provenance: readonly Record<string, unknown>[],
) {
  const candidateIds = new Set(
    candidates.filter((candidate) => candidate.candidateType === candidateType).map(({ id }) => id),
  );
  return {
    schemaVersion: 'immunograph-predictions.v1',
    candidateType,
    observations: observations
      .map(plainRecord)
      .filter((observation) => candidateIds.has(String(observation.candidateId))),
    provenance,
  };
}

function candidateEvidenceLinks(details: ReadonlyArray<Record<string, unknown>>) {
  return details.map((detail) => {
    const candidate = plainRecord(detail.candidate);
    return {
      candidateId: candidate.id,
      observationIds: arrayFrom(candidate.predictionObservations).map(
        (item) => plainRecord(item).id,
      ),
      constraintOutcomeIds: arrayFrom(candidate.constraintOutcomes).map(
        (item) => plainRecord(item).id,
      ),
      evidenceSummaryIds: arrayFrom(candidate.evidenceSummaries).map(
        (item) => plainRecord(item).id,
      ),
    };
  });
}

function mergePredictorExecutions(
  predictorExecutions: readonly unknown[],
  details: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const execution of predictorExecutions.map(plainRecord)) {
    if (typeof execution.id === 'string') byId.set(execution.id, execution);
  }
  for (const detail of details) {
    const candidate = plainRecord(detail.candidate);
    for (const observation of arrayFrom(candidate.predictionObservations).map(plainRecord)) {
      const execution = plainRecord(observation.predictorExecution);
      if (typeof execution.id === 'string') byId.set(execution.id, execution);
    }
  }
  return [...byId.values()].map(plainRecord);
}

function candidatesCsv(rows: readonly Record<string, unknown>[]): string {
  const columns = [
    'candidateId',
    'rank',
    'track',
    'peptide',
    'start',
    'end',
    'allele',
    'finalScore',
    'category',
    'confidence',
  ];
  return `${columns.join(',')}\n${rows
    .map((row) => {
      const candidate = plainRecord(row.candidate);
      const values = {
        candidateId: row.candidateId ?? candidate.id,
        rank: row.rank,
        track: row.track ?? candidate.candidateType,
        peptide: candidate.peptide,
        start: candidate.start,
        end: candidate.end,
        allele: candidate.allele,
        finalScore: row.finalScore,
        category: row.category,
        confidence: row.confidence,
      };
      return columns.map((column) => csvCell(values[column as keyof typeof values])).join(',');
    })
    .join('\n')}\n`;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function constructFasta(runId: string, sequence: string): string {
  if (sequence.length === 0) {
    return `>immunograph_${runId}_no_construct_generated\n`;
  }
  return `>immunograph_${runId}_research_construct\n${sequence}\n`;
}

function fixtureReceptorPdbqt(runId: string): string {
  return [
    'REMARK ImmunoGraph fixture receptor placeholder',
    `REMARK runId ${runId}`,
    'REMARK sourceStatus FIXTURE',
    'REMARK scientificUse false',
    'ATOM      1  N   GLY A   1       0.000   0.000   0.000  0.00  0.00    +0.000 N',
    'ATOM      2  CA  GLY A   1       1.250   0.100   0.000  0.00  0.00    +0.000 C',
    'ATOM      3  C   GLY A   1       2.000   1.200   0.200  0.00  0.00    +0.000 C',
    'TER',
    '',
  ].join('\n');
}

function fixtureLigandPdbqt(runId: string): string {
  return [
    'REMARK ImmunoGraph fixture ligand placeholder',
    `REMARK runId ${runId}`,
    'REMARK sourceStatus FIXTURE',
    'REMARK scientificUse false',
    'ROOT',
    'ATOM      1  C1  LIG L   1       0.600   0.500   0.400  0.00  0.00    +0.000 C',
    'ATOM      2  O1  LIG L   1       1.600   0.600   0.400  0.00  0.00    -0.200 O',
    'ENDROOT',
    'TORSDOF 0',
    '',
  ].join('\n');
}

function fixtureDockingOutputPdbqt(runId: string): string {
  return [
    'REMARK ImmunoGraph fixture docking output',
    `REMARK runId ${runId}`,
    'REMARK sourceStatus FIXTURE',
    'REMARK scientificUse false',
    'MODEL 1',
    'REMARK VINA RESULT: -6.300 0.000 0.000',
    'ATOM      1  C1  LIG L   1       0.700   0.500   0.400  0.00  0.00    +0.000 C',
    'ATOM      2  O1  LIG L   1       1.700   0.700   0.500  0.00  0.00    -0.200 O',
    'ENDMDL',
    'MODEL 2',
    'REMARK VINA RESULT: -6.100 0.500 0.800',
    'ATOM      1  C1  LIG L   1       0.900   0.300   0.600  0.00  0.00    +0.000 C',
    'ATOM      2  O1  LIG L   1       1.900   0.500   0.700  0.00  0.00    -0.200 O',
    'ENDMDL',
    '',
  ].join('\n');
}

function fixtureDockingPoses(
  runId: string,
  selectedCandidates: ReadonlyArray<{ id: string }>,
): Array<Record<string, unknown>> {
  const candidateId = selectedCandidates[0]?.id ?? null;
  return [1, 2, 3].map((rank) => ({
    poseId: `${runId}-fixture-pose-${rank}`,
    rank,
    candidateId,
    affinityKcalMol: -6.5 + rank * 0.2,
    rmsdLowerBound: rank === 1 ? 0 : rank * 0.5,
    rmsdUpperBound: rank === 1 ? 0 : rank * 0.8,
    sourceStatus: 'FIXTURE',
    scientificUse: false,
  }));
}

function fixtureDockingSummary(
  runId: string,
  selectedCandidates: ReadonlyArray<{ id: string }>,
): Record<string, unknown> {
  return {
    schemaVersion: 'immunograph-docking-summary.v1',
    runId,
    sourceStatus: 'FIXTURE',
    scientificUse: false,
    validationStatus: 'VERIFIED_FIXTURE',
    disclaimer:
      'Docking files in this package are deterministic fixture artifacts for workflow demonstration unless live docking provenance explicitly states otherwise.',
    selectedCandidateIds: selectedCandidates.map((candidate) => candidate.id),
    artifacts: [
      'docking/receptor.pdbqt',
      'docking/ligand.pdbqt',
      'docking/docking-output.pdbqt',
      'docking/docking-poses.json',
      'docking/docking-view.png',
    ],
  };
}

function fixtureDockingProvenance(runId: string): Record<string, unknown> {
  return {
    connectorId: 'immunograph-fixture-docking',
    connectorVersion: '1.0.0',
    method: 'fixture-docking-artifact-generator',
    methodVersion: '1.0.0',
    runId,
    status: 'FIXTURE',
    predictionSource: 'FIXTURE',
    scientificUse: false,
    validationStatus: 'VERIFIED_FIXTURE',
    parameters: {
      receptor: 'docking/receptor.pdbqt',
      ligand: 'docking/ligand.pdbqt',
      output: 'docking/docking-output.pdbqt',
      preview: 'docking/docking-view.png',
    },
  };
}

function createFixtureDockingPreviewPng(width = 640, height = 360): Buffer {
  const channels = 4;
  const rows = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * channels + 1);
    rows[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * channels;
      rows[offset] = 244;
      rows[offset + 1] = 249;
      rows[offset + 2] = 247;
      rows[offset + 3] = 255;
    }
  }

  drawRect(rows, width, height, 42, 42, 556, 276, [217, 231, 226, 255]);
  drawLine(rows, width, height, 90, 278, 562, 278, [74, 100, 92, 255]);
  drawLine(rows, width, height, 90, 278, 90, 78, [74, 100, 92, 255]);
  drawLine(rows, width, height, 90, 278, 214, 182, [74, 100, 92, 255]);

  for (let index = 0; index < 22; index += 1) {
    const angle = index * 0.75;
    const x = Math.round(280 + Math.cos(angle) * (96 + index * 3));
    const y = Math.round(180 + Math.sin(angle) * (54 + index * 1.5));
    drawCircle(rows, width, height, x, y, 16, [19, 94, 78, 220]);
  }
  drawCircle(rows, width, height, 354, 176, 18, [245, 158, 11, 255]);
  drawCircle(rows, width, height, 386, 164, 12, [245, 158, 11, 255]);
  drawCircle(rows, width, height, 414, 184, 10, [245, 158, 11, 255]);
  drawLine(rows, width, height, 354, 176, 386, 164, [146, 64, 14, 255]);
  drawLine(rows, width, height, 386, 164, 414, 184, [146, 64, 14, 255]);
  drawRect(rows, width, height, 318, 118, 138, 112, [20, 184, 166, 130]);

  return buildPng(width, height, rows);
}

function drawRect(
  rows: Buffer,
  width: number,
  height: number,
  left: number,
  top: number,
  rectWidth: number,
  rectHeight: number,
  color: readonly [number, number, number, number],
): void {
  for (let x = left; x < left + rectWidth; x += 1) {
    setPixel(rows, width, height, x, top, color);
    setPixel(rows, width, height, x, top + rectHeight, color);
  }
  for (let y = top; y < top + rectHeight; y += 1) {
    setPixel(rows, width, height, left, y, color);
    setPixel(rows, width, height, left + rectWidth, y, color);
  }
}

function drawLine(
  rows: Buffer,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: readonly [number, number, number, number],
): void {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    setPixel(rows, width, height, x, y, color);
    if (x === x1 && y === y1) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function drawCircle(
  rows: Buffer,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  color: readonly [number, number, number, number],
): void {
  const radiusSquared = radius * radius;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radiusSquared) {
        setPixel(rows, width, height, x, y, color);
      }
    }
  }
}

function setPixel(
  rows: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = y * (width * 4 + 1) + 1 + x * 4;
  const alpha = color[3] / 255;
  rows[offset] = Math.round(color[0] * alpha + rows[offset]! * (1 - alpha));
  rows[offset + 1] = Math.round(color[1] * alpha + rows[offset + 1]! * (1 - alpha));
  rows[offset + 2] = Math.round(color[2] * alpha + rows[offset + 2]! * (1 - alpha));
  rows[offset + 3] = 255;
}

function buildPng(width: number, height: number, rawRows: Buffer): Buffer {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rawRows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function summaryMarkdown(
  run: Record<string, unknown>,
  rankedCandidates: readonly Record<string, unknown>[],
  provenance: readonly Record<string, unknown>[],
): string {
  return [
    '# ImmunoGraph Research Summary',
    '',
    `Run ID: ${String(run.id)}`,
    `Execution mode: ${String(run.executionMode ?? 'UNKNOWN')}`,
    `Run quality: ${String(run.quality ?? 'UNKNOWN')}`,
    `Ranked candidates: ${rankedCandidates.length}`,
    `Connector records: ${provenance.length}`,
    '',
    '## Limitations',
    '',
    ...limitations(run.executionMode).map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function limitationsMarkdown(executionMode: unknown): string {
  return ['# Limitations', '', ...limitations(executionMode).map((item) => `- ${item}`), ''].join(
    '\n',
  );
}

function limitations(executionMode: unknown): string[] {
  return executionMode === 'SYNTHETIC'
    ? [RESEARCH_LIMITATION, SYNTHETIC_LIMITATION]
    : [RESEARCH_LIMITATION];
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      item instanceof Date ? item.toISOString() : item,
    ]),
  );
}

function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function iso(value: Date): string {
  return value.toISOString();
}
