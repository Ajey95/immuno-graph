import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { registeredHandlers } from '../src/modules/common/mcp-compat.js';
import { createToolGroups } from '../src/modules/tool-catalog.js';

const outputDirectory = resolve(process.env.IMMUNOGRAPH_AUDIT_OUTPUT_DIR ?? join(process.cwd(), 'outputs', 'tool-semantics'));
const client = new Client({ name: 'immunograph-semantic-audit', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
});
const handlers = createToolGroups().flatMap((group) => registeredHandlers(group.controller).map(({ options }) => ({ group: group.name, options })));
const report: Array<Record<string, unknown>> = [];

await client.connect(transport);
try {
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 46);
  assert.deepEqual(new Set(listed.tools.map((tool) => tool.name)), new Set(handlers.map(({ options }) => options.name)));
  for (const { group, options } of handlers) {
    const request = structuredClone((options.examples as { request: Record<string, unknown> }).request);
    const started = Date.now();
    try {
      const response = await client.callTool({ name: options.name, arguments: request }, { timeout: 30000 });
      const envelope = response.structuredContent as { ok?: boolean; data?: Record<string, unknown>; error?: { code?: string; message?: string } } | undefined;
      assert.equal(response.isError, false, envelope?.error?.message);
      assert.equal(envelope?.ok, true, envelope?.error?.message);
      assert.ok(envelope.data);
      const artifactHashes = verifyArtifacts(envelope.data);
      verifySemantics(options.name, request, envelope.data);
      report.push({
        group, tool: options.name, outcome: 'PASS', durationMs: Date.now() - started,
        request, result: summarize(envelope.data), artifactHashes,
      });
    } catch (error) {
      report.push({ group, tool: options.name, outcome: 'FAIL', durationMs: Date.now() - started, request, error: error instanceof Error ? error.message : String(error) });
    }
  }
} finally {
  await client.close();
}

await mkdir(outputDirectory, { recursive: true });
const reportPath = join(outputDirectory, 'all-46-example-results.json');
await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), toolCount: report.length, results: report }, null, 2));
const failed = report.filter((entry) => entry.outcome === 'FAIL');
console.log(JSON.stringify({ toolCount: report.length, passed: report.length - failed.length, failed: failed.map((entry) => ({ tool: entry.tool, error: entry.error })), reportPath }, null, 2));
if (failed.length > 0) process.exitCode = 1;

function verifyArtifacts(value: unknown): Array<{ fileName: string; byteLength: number; sha256: string }> {
  const found: Array<{ fileName: string; byteLength: number; sha256: string }> = [];
  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.contentBase64 === 'string') {
      assert.equal(typeof record.sha256, 'string');
      assert.equal(typeof record.byteLength, 'number');
      const bytes = Buffer.from(record.contentBase64, 'base64');
      assert.equal(bytes.length, record.byteLength);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
      found.push({ fileName: String(record.fileName ?? record.artifactId ?? 'unnamed'), byteLength: bytes.length, sha256: record.sha256 });
    }
    for (const [key, item] of Object.entries(record)) if (key !== 'contentBase64') visit(item);
  }
  visit(value);
  return found;
}

function summarize(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}… [${value.length} chars]` : value;
  if (Array.isArray(value)) return depth >= 3 ? { length: value.length } : { length: value.length, first: value.slice(0, 2).map((item) => summarize(item, depth + 1)) };
  if (!value || typeof value !== 'object') return value;
  if (depth >= 4) return '[object]';
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, key === 'contentBase64' ? `[base64 ${String(item).length} chars]` : summarize(item, depth + 1)]));
}

function verifySemantics(name: string, request: Record<string, unknown>, data: Record<string, unknown>): void {
  assert.ok(Object.keys(data).length > 0, `${name} returned no data`);
  const d = data as Record<string, any>;
  const provenance = Array.isArray(d.provenance) ? d.provenance : d.provenance ? [d.provenance] : [];
  const fixtureExamples = new Set([
    'predict_mhci', 'predict_mhcii', 'predict_bcell', 'calculate_population_coverage',
    'optimize_shortlist_coverage', 'fetch_structure', 'validate_structure', 'map_epitopes_to_structure',
    'calculate_surface_accessibility', 'calculate_structure_confidence', 'detect_binding_pockets',
    'create_molstar_view', 'fetch_compound', 'validate_compound', 'deduplicate_compounds',
    'calculate_molecular_descriptors', 'prepare_ligand', 'prepare_receptor', 'run_docking',
    'cluster_docking_poses', 'extract_interactions',
  ]);
  if (fixtureExamples.has(name)) {
    assert.ok(provenance.length > 0);
    assert.ok(provenance.every((entry: { status: string; scientificUse: boolean }) => entry.status === 'FIXTURE' && entry.scientificUse === false));
  }
  switch (name) {
    case 'validate_sequence':
      assert.equal(d.normalizedSequence, 'ACDEFGHIK');
      assert.equal(d.sequenceLength, 9);
      break;
    case 'generate_candidate_peptides':
      assert.ok(d.candidates.length > 0);
      assert.ok(d.candidates.every((item: { peptide: string; start: number; end: number }) => item.peptide === (request.sequence as string).slice(item.start - 1, item.end)));
      break;
    case 'predict_mhci':
    case 'predict_mhcii':
      assert.ok(d.observations.length > 0);
      assert.ok(d.observations.every((item: { peptide: string; allele: string; rawFields: { notPredictorOutput: boolean } }) => item.peptide.length > 0 && item.allele.length > 0 && item.rawFields.notPredictorOutput === true));
      break;
    case 'predict_bcell':
      assert.ok(d.residueScores.length > 0);
      assert.equal(d.rawMethodFields.notPredictorOutput, true);
      break;
    case 'predict_synthetic_binding':
      assert.equal(provenance[0].status, 'SYNTHETIC');
      assert.equal(provenance[0].scientificUse, false);
      assert.ok(d.observations.length > 0);
      break;
    case 'normalize_scores':
      assert.equal(d.values[0].observationId, 'obs-1');
      assert.equal(d.values[0].normalizedScore, 0.8);
      break;
    case 'compute_consensus':
      assert.equal(d.weightedMean, 0.8);
      assert.equal(d.consensus, 0.8);
      break;
    case 'compute_consensus_batch':
      assert.ok(d.groups.length > 0);
      assert.equal(d.groups[0].consensus, 0.8);
      break;
    case 'calculate_population_coverage':
      assert.ok(d.projectedCoverage >= 0 && d.projectedCoverage <= 1);
      assert.equal(d.metrics.dataNature, 'FABRICATED_DEMO_VALUE');
      break;
    case 'calculate_synthetic_population_coverage':
      assert.equal(provenance[0].status, 'SYNTHETIC');
      assert.equal(provenance[0].scientificUse, false);
      assert.ok(d.populations.length > 0, 'The documented synthetic population example returned no calculated population.');
      assert.deepEqual(d.unavailablePopulationIds, []);
      break;
    case 'rank_candidates':
      assert.equal(d.phase, 'FINAL');
      assert.equal(d.candidates[0].trackRank, 1);
      assert.ok(d.candidates[0].finalScore >= 0 && d.candidates[0].finalScore <= 1);
      break;
    case 'optimize_shortlist_coverage':
      assert.ok(d.steps.length > 0);
      assert.equal(d.finalCoverage, d.steps.at(-1).cumulativeCoverage);
      assert.equal(d.selectedCandidateIds.length, d.steps.length);
      break;
    case 'optimize_construct_genetic':
      assert.ok(d.selectedCandidateIds.length > 0 && d.constructSequence.length > 0);
      assert.equal(provenance[0].status, 'SYNTHETIC');
      assert.equal(d.confidence.scientificUse, false);
      break;
    case 'calibrate_confidence':
      assert.equal(d.method, 'RULE_BASED_CALIBRATION');
      assert.equal(d.reliability.evaluationCount, 0);
      assert.equal(d.reliability.brierScore, null);
      assert.equal(provenance[0].status, 'SYNTHETIC');
      break;
    case 'detect_overlapping_epitopes':
      assert.equal(d.pairs.length, 1);
      assert.deepEqual(d.components, [['candidate-1', 'candidate-2']]);
      break;
    case 'remove_duplicate_candidates':
      assert.equal(d.canonicalCandidates.length, 1);
      assert.deepEqual(d.duplicateLinks, [{ duplicateId: 'candidate-1-copy', canonicalId: 'candidate-1', edgeType: 'DUPLICATE_OF', ruleId: 'DUPLICATE-001' }]);
      break;
    case 'validate_thresholds':
      assert.ok(d.results.length > 0 && d.results[0].outcomes.length > 0);
      break;
    case 'categorize_candidates':
      assert.equal(d.candidates[0].category, 'RECOMMENDED');
      break;
    case 'apply_constraint_rules':
      assert.ok(d.eligibleCandidateIds.includes('candidate-1'));
      assert.ok(d.constraintResults[0].outcomes.length > 0);
      break;
    case 'fetch_structure':
      assert.equal(d.structure.format, 'FIXTURE_JSON');
      assert.equal(d.structure.scientificUse, false);
      break;
    case 'validate_structure':
      assert.equal(d.valid, true);
      assert.ok(d.checks.length > 0 && d.warnings.includes('fixture-structure-not-live'));
      break;
    case 'map_epitopes_to_structure':
      assert.ok(d.mappings.length > 0 && d.mappings[0].status === 'MAPPED');
      break;
    case 'calculate_surface_accessibility':
      assert.ok(d.accessibility.length > 0);
      assert.ok(d.accessibility.every((item: { status: string; surfaceAccessibility: number }) => item.status === 'FIXTURE' && item.surfaceAccessibility >= 0 && item.surfaceAccessibility <= 1));
      break;
    case 'calculate_structure_confidence':
      assert.ok(d.confidenceScore >= 0 && d.confidenceScore <= 1);
      assert.ok(d.warnings.includes('fixture-confidence-not-live'));
      break;
    case 'detect_binding_pockets':
      assert.ok(d.pockets.length > 0 && d.pockets[0].sourceStatus === 'FIXTURE');
      break;
    case 'create_molstar_view':
      assert.equal(d.viewer.sourceStatus, 'FIXTURE');
      assert.equal(d.viewer.scientificUse, false);
      break;
    case 'fetch_compound':
      assert.equal(d.compound.sourceStatus, 'FIXTURE');
      assert.ok(d.compound.smiles.length > 0);
      break;
    case 'validate_compound':
      assert.equal(d.valid, true);
      assert.ok(d.warnings.includes('fixture-compound-not-live'));
      break;
    case 'deduplicate_compounds':
      assert.ok(d.canonicalCompoundIds.length > 0);
      break;
    case 'calculate_molecular_descriptors':
      assert.ok(d.descriptors.heavyAtomCount > 0);
      break;
    case 'prepare_ligand':
    case 'prepare_receptor':
      assert.equal(d.format, 'FIXTURE_JSON');
      assert.equal(d.scientificUse, false);
      break;
    case 'validate_docking_box':
      assert.equal(d.volume, (request.size as { x: number; y: number; z: number }).x * (request.size as { x: number; y: number; z: number }).y * (request.size as { x: number; y: number; z: number }).z);
      assert.equal(d.provenance.status, 'LIVE');
      break;
    case 'run_docking':
      assert.equal(d.dockingRun.sourceStatus, 'FIXTURE');
      assert.ok(d.poses.length > 0 && d.poses.every((item: { affinityKcalMol: number }) => Number.isFinite(item.affinityKcalMol)));
      break;
    case 'cluster_docking_poses':
      assert.ok(d.clusters.length > 0 && d.clusters[0].poseIds.length > 0);
      break;
    case 'extract_interactions':
      assert.ok(d.interactions.length > 0 && d.interactions[0].interactionType === 'FIXTURE_CONTACT');
      break;
    case 'generate_report':
      assert.ok(d.artifacts.length >= 2 && d.runQuality === 'DEMONSTRATION_ONLY');
      break;
    case 'export_candidates':
      assert.equal(d.mediaType, 'text/csv');
      assert.ok(d.byteLength > 0);
      break;
    case 'visualize_results':
      assert.equal(d.viewModel.itemCount, d.viewModel.items.length);
      break;
    case 'explain_candidate':
      assert.ok(d.deterministic.text.includes('key-1'));
      assert.equal(d.llmParaphrase, null);
      break;
    case 'export_workflow_trace':
      assert.equal(d.eventCount, 1);
      assert.ok(d.artifact.byteLength > 0);
      break;
    case 'describe_agentic_workflow':
      assert.equal(d.deploymentBoundary, 'ONE_STANDARD_MCP_SERVER');
      assert.ok(d.agents.length > 0 && d.workflowPlan.nodes.length > 0);
      break;
    case 'run_agentic_workflow':
      assert.equal(d.status, 'COMPLETED');
      assert.deepEqual(d.toolResults.map((item: { toolName: string }) => item.toolName), ['validate_sequence', 'generate_candidate_peptides']);
      assert.equal(d.toolResults[0].result.data.normalizedSequence, 'ACDEFGHIK');
      assert.equal(d.toolResults[1].result.data.candidates[0].peptide, 'ACDEFGHIK');
      break;
    case 'chat_with_research_agent':
      assert.equal(d.grounded, true);
      assert.ok(d.citedEvidenceKeys.includes('workflow'));
      break;
    case 'export_research_package': {
      assert.equal(d.artifact.mediaType, 'application/zip');
      const entries = storedZipEntries(Buffer.from(d.artifact.contentBase64, 'base64'));
      assert.ok(d.requiredSections.every((entry: string) => entry.endsWith('/') ? entries.some((name) => name.startsWith(entry)) : entries.includes(entry)));
      break;
    }
    default:
      throw new Error(`No semantic assertion exists for ${name}.`);
  }
}

function storedZipEntries(bytes: Buffer): string[] {
  const entries: string[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0, 'ZIP entry is not stored');
    const compressedLength = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    entries.push(bytes.subarray(nameStart, nameStart + nameLength).toString('utf8'));
    offset = nameStart + nameLength + extraLength + compressedLength;
  }
  assert.ok(entries.length > 0, 'ZIP contains no local file entries');
  return entries;
}
