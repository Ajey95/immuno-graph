import { z } from 'zod';

import type { ToolOptions } from './common/mcp-compat.js';

// These are the descriptions exposed through tools/list. Keep selection advice
// close to the protocol boundary so every MCP host receives the same guidance.
const descriptions: Record<string, string> = {
  validate_sequence: 'Validate one protein FASTA record and return its normalized sequence, length, header, and SHA-256 identity. Use before peptide generation or prediction; this checks sequence syntax, not structure or biological activity. Invalid input returns a structured validation error.',
  generate_candidate_peptides: 'Enumerate one-based peptide windows from a supplied protein sequence for MHC-I or MHC-II exploration. Use after validate_sequence and before prediction; this creates candidates, not binding scores. Returns each window with peptide, start, end, and length.',
  predict_mhci: 'Get MHC-I peptide-binding observations for supplied class-I alleles and peptide lengths through the configured IEDB connector or an allowed exact fixture. Use for class-I evidence, not MHC-II or B-cell evidence. LIVE_ONLY requires the live connector; results include method and source provenance, and unavailable sources return a structured failure.',
  predict_mhcii: 'Get MHC-II peptide-binding observations for supplied class-II alleles and peptide lengths through the configured IEDB connector or an allowed exact fixture. Use for class-II evidence rather than predict_mhci or predict_bcell. LIVE_ONLY requires the live connector; results include method and source provenance, and unavailable sources return a structured failure.',
  predict_bcell: 'Score linear B-cell sequence positions using configured live IEDB BepiPred-3.0, local Parker hydrophilicity, or an exact GraphBepi fixture. Choose the method explicitly: Parker is a physicochemical proxy and GraphBepi is fixture-only in this release. Returns residue scores, regions, and provenance; live IEDB access may fail or time out.',
  predict_synthetic_binding: 'Create deterministic synthetic MHC binding values for demos and software tests from supplied candidates and alleles. Use only when teaching or testing the pipeline; use predict_mhci or predict_mhcii for configured scientific prediction. Output is marked synthetic and must not be treated as binding evidence.',
  normalize_scores: 'Transform supplied raw observations into comparable unit-interval values using a named versioned normalization registry. Use after evidence collection and before consensus or ranking; this does not fetch predictors or improve source quality. Returns normalized observations and records the applied transformation.',
  compute_consensus: 'Combine one candidate group of normalized observations into weighted consensus, agreement, and completeness. Use after normalize_scores when the group and required weight are known; use compute_consensus_batch for several independent groups. It calculates from caller-supplied evidence and does not make a new prediction.',
  compute_consensus_batch: 'Compute weighted consensus separately for multiple candidate groups in one call. Use instead of repeated compute_consensus calls when groups are already assembled; groups are not pooled together. Returns one result per supplied group, based only on its input observations.',
  calculate_population_coverage: 'Estimate HLA population coverage for supplied peptide-allele associations using a configured authoritative IEDB service or an explicitly allowed exact fixture. Use when the allele restrictions and population IDs are known; use calculate_synthetic_population_coverage only for demonstrations. LIVE_ONLY requires the live service and the result carries source provenance.',
  calculate_synthetic_population_coverage: 'Calculate deterministic demonstration coverage from synthetic HLA-frequency inputs. Use for teaching or testing the coverage pipeline, never as a population estimate; use calculate_population_coverage for a configured authoritative source. The output remains synthetic regardless of its numeric values.',
  rank_candidates: 'Calculate preliminary candidate scores or final stable ranks from supplied evidence snapshots and completion flags. Use PRELIMINARY before final constraints and FINAL only after base and final constraints are complete; this does not call predictors. Returns ranked candidates and applies the versioned ranking profile to the supplied values.',
  optimize_shortlist_coverage: 'Select a deterministic T-cell shortlist from eligible ranked candidates using supplied population coverage and construct constraints. Use after final ranking when shortlist size or coverage is the decision; use optimize_construct_genetic for seeded construct search. The result depends on the supplied coverage matrix and is not an independently measured population outcome.',
  optimize_construct_genetic: 'Run seeded genetic-style search over supplied candidates to balance construct size, coverage, redundancy, and manufacturability terms. Use after final ranking when searching construct arrangements; use optimize_shortlist_coverage for simpler deterministic shortlist selection. Returns a computed proposal, not a validated vaccine construct.',
  calibrate_confidence: 'Fit Platt or isotonic calibration on labeled samples and evaluate on separate labeled outcomes, or emit rule-based confidence. Use fitted modes only with real calibration and evaluation labels; rule-based mode has no measured reliability. Returns calibrated probabilities and metrics only where the input labels support them.',
  detect_overlapping_epitopes: 'Find positional overlap competitors and connected components among candidate intervals. Use before apply_constraint_rules when overlaps need review; this tool does not choose a winner or deduplicate identities. Returns interval relationships from caller-supplied coordinates.',
  remove_duplicate_candidates: 'Group candidates with identical positional identity and choose canonical records. Use before apply_constraint_rules to remove true duplicates; identical peptide strings at different coordinates remain separate. Returns canonical and duplicate relationships without changing source evidence.',
  validate_thresholds: 'Evaluate the versioned hard biological threshold profile against supplied candidates. Use before categorization or final constraint application; this reports rule outcomes rather than ranking candidates. Missing evidence is represented in the rule results instead of invented as a pass.',
  categorize_candidates: 'Assign provisional decision categories and blocking conditions from supplied scores, rules, and thresholds. Use after scoring and rule evaluation; use rank_candidates for numeric ordering, not category assignment. Returns deterministic categories that retain the input evidence boundaries.',
  apply_constraint_rules: 'Apply base, duplicate, and overlap rules to one immutable candidate snapshot and return final rule outcomes. Use after validate_thresholds, remove_duplicate_candidates, and detect_overlapping_epitopes when their inputs are ready. The snapshot hash binds the decision to supplied evidence; this tool does not fetch new evidence.',
  fetch_structure: 'Retrieve PDB coordinates from RCSB or an AlphaFold model from the configured provider, or replay an exact fixture. Use when a structure accession is known and before coordinate-based analyses; this is not sequence prediction. LIVE_ONLY requires network access and returns source provenance plus coordinate artifact bytes.',
  validate_structure: 'Check supplied structure metadata and, when PDB bytes are provided, parse actual atoms, chains, and residues. Use before mapping, accessibility, or docking preparation; this does not evaluate model confidence or binding. Mismatched metadata returns a structured failure.',
  map_epitopes_to_structure: 'Align supplied candidate sequence positions to residue coordinates in a PDB structure, or replay an exact fixture. Use after validate_structure when mapping sequence evidence onto a model; use calculate_surface_accessibility for solvent exposure. Direct-coordinate mode requires reference sequence and PDB bytes and returns mapped positions.',
  calculate_surface_accessibility: 'Calculate relative solvent accessibility for mapped residues with FreeSASA on supplied PDB coordinates, or replay an exact fixture. Use after map_epitopes_to_structure when asking whether residues are exposed; use calculate_structure_confidence for model pLDDT instead. Live computation requires FreeSASA and PDB bytes; output is computed accessibility, not epitope probability.',
  calculate_structure_confidence: 'Extract per-residue AlphaFold pLDDT from supplied AlphaFold PDB bytes or summarize supplied confidence metrics. Use to inspect local model confidence, not solvent exposure or epitope probability; experimental PDB B-factors are not accepted as pLDDT. Returns residue scores or a metric summary with source context.',
  detect_binding_pockets: 'Run fpocket on supplied PDB coordinates to identify geometric binding pockets, or replay an exact fixture. Use after structure validation for pocket exploration; use run_docking to score a prepared receptor-ligand pair. Live mode needs the fpocket binary and PDB bytes; pocket scores are computational descriptors.',
  create_molstar_view: 'Package supplied protein and optional ligand PDB coordinates into an interactive Mol* HTML viewer, or return an exact fixture reference. Use when a client needs a 3D visualization after structure or docking work; this does not calculate a new pose. Returns HTML bytes whose viewer loads its library from a CDN.',
  fetch_compound: 'Retrieve compound identity and SMILES from configured PubChem access or replay an exact fixture. Use with a known compound reference before validation or ligand preparation; this does not calculate descriptors. LIVE_ONLY requires PubChem access and returns source provenance.',
  validate_compound: 'Parse and canonicalize supplied SMILES with RDKit for live-sourced compounds, or validate an explicit fixture record. Use before deduplication, descriptors, or ligand preparation; this checks chemical syntax and identity, not biological activity. RDKit unavailability returns a structured failure for the live path.',
  deduplicate_compounds: 'Compare supplied compounds by RDKit canonical isomeric SMILES and InChIKey when live chemistry is requested. Use after validate_compound to collapse chemical identity duplicates; this is distinct from remove_duplicate_candidates, which handles epitope positions. Returns canonical groups and preserves input provenance.',
  calculate_molecular_descriptors: 'Calculate molecular descriptor values for a supplied SMILES using the selected RDKit or lightweight method. Use after validate_compound for chemistry features; this does not predict binding or prepare 3D ligand coordinates. RDKit mode requires its runtime, while lightweight estimates are explicitly identified as such.',
  prepare_ligand: 'Generate a 3D SDF and Meeko PDBQT from supplied SMILES using configured RDKit and Meeko, or return an exact fixture reference. Use before run_docking for a ligand; calculate_molecular_descriptors does not produce docking coordinates. Live preparation returns artifact bytes and hashes and fails if a required runtime is absent.',
  prepare_receptor: 'Convert supplied protein PDB coordinates and selected chains into receptor PDBQT with Meeko, or return an exact fixture reference. Use before run_docking for the receptor; validate_structure checks coordinates but does not prepare charges or PDBQT. Live preparation requires the Meeko runtime and returns artifact bytes.',
  validate_docking_box: 'Validate the center and size of a proposed docking search box and calculate its volume. Use before run_docking to catch invalid box geometry; this does not run Vina or establish a binding site. Returns validated dimensions or a structured validation failure.',
  run_docking: 'Run configured AutoDock Vina on receptor and ligand PDBQT bytes inside a supplied box, or replay an exact fixture. Use after prepare_receptor, prepare_ligand, and validate_docking_box; LIVE_ONLY requires Vina and never silently substitutes a fixture. Returns scored coordinate poses, viewer HTML, and ZIP bytes; runtime can be substantial and scores are computational estimates.',
  cluster_docking_poses: 'Group supplied Vina ligand poses by coordinate RMSD using DBSCAN or hierarchical clustering, or replay an exact fixture. Use after run_docking to summarize pose diversity; this does not redock or measure affinity. Direct mode requires matching pose records and PDBQT bytes and returns cluster assignments.',
  extract_interactions: 'Run PLIP on a supplied protein-ligand complex PDB to identify computed contact geometry, or replay an exact fixture. Use after run_docking when a representative pose has been exported; this does not experimentally measure binding. Live mode requires PLIP and returns structured contacts plus the original XML artifact.',
  generate_report: 'Render the supplied approved report snapshot into requested JSON, Markdown, or CSV artifacts. Use after evidence review when a report is needed; export_candidates is for candidate rows and export_research_package is for a ZIP. Returns inline file bytes with lengths and SHA-256 hashes; it does not independently fetch evidence.',
  export_candidates: 'Serialize supplied candidate records into JSON or CSV with raw and normalized scores kept separate. Use after candidate review for a table export; generate_report produces a broader report. Returns file bytes and checksum metadata, not new scientific scores.',
  visualize_results: 'Build a deterministic visualization view model from supplied evidence for the selected chart or graph type. Use when a UI will render results; create_molstar_view is for coordinate-based 3D HTML. Returns view-model data, not a PNG or an independent scientific analysis.',
  explain_candidate: 'Explain a fixed candidate category and score from supplied component scores, rule outcomes, and provenance. Use after ranking and constraints when a researcher needs a decision rationale; this cannot change scientific values. Deterministic mode uses only supplied evidence; optional LLM paraphrase needs its configured runtime.',
  export_workflow_trace: 'Serialize supplied ordered workflow events into a redacted JSON trace artifact. Use for audit or reproducibility after a workflow; generate_report is for the scientific summary. Returns inline bytes and SHA-256 metadata while omitting secrets and private reasoning.',
  describe_agentic_workflow: 'Describe the bounded workflow manifest, stage permissions, and approval gates without running tools. Use to inspect orchestration before run_agentic_workflow; this is a description, not a live scientific call. Returns the declared stages and tool permissions.',
  run_agentic_workflow: 'Execute caller-supplied approved typed toolCalls in bounded stage order, or return a plan if no calls are supplied. Use when the client has already selected inputs and allowed tools; describe_agentic_workflow only inspects the manifest. The tool does not autonomously invent calls, and approval gates pause rather than self-approve.',
  chat_with_research_agent: 'Answer a researcher question from the supplied evidence summary under the bounded agent policy. Use for an explanation after evidence has been assembled; this tool does not independently retrieve papers, predict epitopes, or run the workflow. Deterministic mode cites supplied evidence; LLM mode requires configured model access.',
  export_research_package: 'Build a checksummed research ZIP from a supplied package snapshot and selected sections. Use after reports and artifacts are ready for handoff; generate_report exports individual report files. It serializes supplied evidence and metadata rather than launching predictors or docking.',
};

const parameterDescriptions: Record<string, string> = {
  accession: 'Provider accession, such as an RCSB PDB ID or AlphaFold accession, matching source.',
  agentMode: 'Choose deterministic policy execution or an enabled LLM-assisted mode.',
  alleles: 'HLA allele identifiers relevant to the selected MHC class.',
  approvedToolNames: 'Exact tool names the caller permits this workflow to invoke.',
  associations: 'Peptide-to-HLA restrictions used for population coverage calculation.',
  audience: 'Intended reader of the candidate explanation.',
  baseConstraints: 'Previously evaluated base rule inputs for final constraint application.',
  baseConstraintsComplete: 'Whether all required base constraint results are present.',
  box: 'Docking search-box center and size in receptor-coordinate angstroms.',
  calibrationSamples: 'Labeled examples used only to fit a calibration model.',
  candidateKey: 'Stable key identifying one epitope candidate across evidence stages.',
  candidateSnapshot: 'Caller-supplied reviewed candidate rows to serialize; no new scores are calculated.',
  candidateType: 'MHC class or candidate category this operation applies to.',
  candidates: 'Caller-supplied candidate records; required nested fields depend on this operation.',
  categories: 'Candidate categories to include in the export.',
  category: 'Final candidate decision category being explained.',
  center: 'Docking-box center coordinates x, y, and z in angstroms.',
  chainIds: 'Protein chain identifiers selected from the supplied structure.',
  classMode: 'Whether coverage uses class-I, class-II, or combined associations.',
  complexPdbBase64: 'Base64-encoded protein-ligand complex PDB bytes from a representative pose.',
  componentScores: 'Named score components that contributed to the fixed final score.',
  compoundId: 'Stable identifier for the supplied compound within this run.',
  compoundRef: 'Provider compound reference or exact fixture key; PubChem uses its CID.',
  compounds: 'Compound records to compare by canonical chemical identity.',
  confidenceMetrics: 'Caller-supplied confidence metrics when no AlphaFold PDB is parsed.',
  configuredRequiredWeight: 'Total weight of evidence methods required by the consensus profile.',
  cpu: 'Number of CPU workers to request for the Vina run.',
  datasetVersion: 'Version label for the synthetic demonstration dataset.',
  dockingBoxId: 'Caller-chosen identifier for the validated docking search box.',
  dockingRunId: 'Identifier of the docking run whose poses or complex are analyzed.',
  duplicateCandidates: 'Candidate records to evaluate for exact positional duplication.',
  eligibleCandidateIds: 'IDs of finally eligible candidates considered for the shortlist.',
  evaluationSamples: 'Held-out labeled samples used to evaluate fitted calibration.',
  evidenceSummary: 'Evidence already assembled by the caller; no retrieval is performed.',
  exhaustiveness: 'Vina search-effort parameter; larger values may take longer.',
  explanationMode: 'Choose deterministic explanation or configured LLM paraphrase.',
  fallbackPolicy: 'Allowed source order; LIVE_ONLY forbids cache and fixture substitution, FIXTURE_ONLY forbids live calls.',
  fasta: 'One protein FASTA record with header and amino-acid sequence.',
  finalConstraintsComplete: 'Whether required final constraint results are present for final ranking.',
  finalRankingSnapshotHash: 'SHA-256 identity of the final ranking snapshot supplying these candidates.',
  finalScore: 'Already computed final candidate score in the unit interval.',
  format: 'Requested structure or export format, as enumerated by this tool.',
  groupKey: 'Stable identifier for one independent consensus group.',
  groups: 'Independent candidate groups, each with its own observations and weights.',
  idempotencyKey: 'Caller-supplied stable key for repeatable export identity.',
  includeAgentTrace: 'Whether to include supplied agent trace data in the package.',
  includeChemistry: 'Whether to include supplied chemistry artifacts in the package.',
  includeDocking: 'Whether to include supplied docking artifacts in the package.',
  includeFutureInterfaces: 'Whether to describe declared future interfaces as well as current stages.',
  includeStructure: 'Whether to include supplied structure artifacts in the package.',
  ligandArtifactRef: 'Reference identifying the ligand coordinate artifact represented in the view.',
  ligandId: 'Caller-chosen ligand identifier for this docking run.',
  ligandPdbBase64: 'Base64-encoded ligand PDB coordinates to embed in a 3D view.',
  ligandPdbqtBase64: 'Base64-encoded prepared ligand PDBQT bytes for Vina.',
  linker: 'Peptide linker sequence used when assembling construct proposals.',
  mappingMode: 'DIRECT_COORDINATE uses supplied PDB and reference sequence; FIXTURE replays an exact case.',
  mappings: 'Candidate-to-structure residue intervals used to calculate accessibility.',
  maximumConstructSize: 'Upper limit on construct size for genetic-style search.',
  maximumGenerations: 'Maximum optimization generations before returning a proposal.',
  maximumShortlistSize: 'Upper limit on candidates selected for the shortlist.',
  method: 'Algorithm or provider method selected for this operation; inspect allowed schema values.',
  methodVersion: 'Version of the selected calculation method.',
  methods: 'Named predictor methods to run or replay; availability depends on configuration.',
  mode: 'Execution or visualization mode; inspect enum choices and required inputs for each.',
  modelSource: 'Origin of a confidence model; AlphaFold pLDDT requires ALPHAFOLD_DB.',
  numModes: 'Maximum Vina ligand poses to return.',
  objective: 'Research objective supplied by the caller to label the bounded workflow.',
  observations: 'Caller-supplied evidence observations; this tool does not fetch them.',
  outputFormats: 'File formats to render from the supplied report snapshot.',
  overlapCandidates: 'Candidate records whose positional overlaps enter final constraint rules.',
  overlapThreshold: 'Minimum overlap fraction used by the final overlap rule.',
  packageSnapshot: 'Complete caller-supplied research snapshot to serialize into the ZIP.',
  parameters: 'Method-specific predictor settings; allowed keys depend on selected methods.',
  peptideLengths: 'Peptide window lengths in amino-acid residues for the selected MHC class.',
  phase: 'PRELIMINARY scores incomplete work; FINAL requires completed base and final constraints.',
  populationIds: 'Population identifiers requested from the coverage source or synthetic dataset.',
  populationSize: 'Number of candidate construct genomes per optimization generation.',
  populationWeights: 'Caller-supplied weights for combining named population coverage values.',
  poses: 'Pose records whose IDs and coordinates correspond to the supplied PDBQT models.',
  posesPdbqtBase64: 'Base64-encoded multi-model Vina pose PDBQT bytes for RMSD clustering.',
  predictions: 'Predicted values to calibrate or score using the selected method.',
  preparationMethod: 'Preparation backend, such as configured Meeko or exact fixture mode.',
  profileVersion: 'Version of the sequence validation profile; mvp-v1.0 is the current profile.',
  proteinHash: 'SHA-256 identity of the protein sequence associated with these candidates.',
  proteinRef: 'Stable protein reference or exact fixture key for this prediction.',
  provenanceStatuses: 'Source-status labels associated with the candidate evidence.',
  question: 'Researcher question to answer using only evidenceSummary.',
  rankingProfileVersion: 'Versioned weighting profile applied to candidate scoring.',
  receptorId: 'Caller-chosen receptor identifier for this docking run.',
  receptorPdbqtBase64: 'Base64-encoded prepared receptor PDBQT bytes for Vina.',
  redactionProfile: 'Named policy for omitting private trace content from export.',
  referenceSequence: 'Protein sequence whose positions are aligned to PDB residues.',
  registryVersion: 'Version of the score normalization profile registry.',
  reportSnapshot: 'Caller-supplied approved report data to render; no evidence retrieval occurs.',
  representativePoseIds: 'Pose IDs whose complex should be examined for contacts.',
  requireHumanApproval: 'Pause at gated workflow stages until the caller supplies approval.',
  residueCount: 'Expected protein residue count for metadata consistency checks.',
  rmsdThresholdAngstrom: 'Ligand RMSD distance cutoff in angstroms for grouping poses.',
  ruleOutcomes: 'Previously computed rule outcomes supporting an explanation.',
  ruleProfileVersion: 'Version of the biological constraint rule profile.',
  runId: 'Caller-chosen identifier linking this call to one research run.',
  runIntent: 'Short description of the planned research workflow to inspect.',
  seed: 'Random seed for reproducible Vina search when supplied.',
  sequence: 'Protein amino-acid sequence without a FASTA header.',
  sequenceHash: 'Optional SHA-256 identity of the supplied protein sequence.',
  size: 'Docking-box edge lengths x, y, and z in angstroms.',
  smiles: 'Chemical structure encoded as a SMILES string.',
  snapshotHash: 'SHA-256 identity of the immutable evidence snapshot.',
  source: 'Selected remote provider or exact fixture source.',
  sourceStatus: 'Provenance label for the supplied structure or compound.',
  structureArtifactRef: 'Reference identifying the supplied structure-coordinate artifact.',
  structureId: 'Stable identifier of the supplied or retrieved structure.',
  structurePdbBase64: 'Base64-encoded protein PDB coordinate bytes for direct computation.',
  targetCoverage: 'Desired population coverage fraction used by optimization.',
  targetId: 'Caller-chosen identifier for the target protein or structure.',
  templateVersion: 'Version of the report layout used to render artifacts.',
  threshold: 'Numeric cutoff for the selected overlap or decision operation.',
  thresholds: 'Named score or decision cutoffs supplied by the caller.',
  toolCalls: 'Typed, caller-selected tool invocations to execute in stage order.',
  traceEvents: 'Ordered caller-supplied events to serialize after redaction.',
  trackRank: 'Existing rank within the candidate track.',
  viewId: 'Caller-chosen identifier for the generated Mol* view.',
  visualizationSnapshot: 'Caller-supplied data for building a view model; no image is rendered.',
  visualizationType: 'Named chart or graph view-model type to construct.',
};

const outputSchema = z.object({
  ok: z.boolean().describe('Whether execution completed successfully.'),
  data: z.object({}).passthrough().optional().describe('Tool-specific result fields on success.'),
  error: z.object({
    code: z.string(),
    category: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.object({}).passthrough().optional(),
  }).optional().describe('Structured failure on unsuccessful execution.'),
  meta: z.object({
    requestId: z.string(),
    runId: z.string(),
    toolName: z.string(),
    toolVersion: z.string(),
    startedAt: z.string(),
    inputHash: z.string(),
    completedAt: z.string().optional(),
    durationMs: z.number().optional(),
    outputHash: z.string().optional(),
  }).passthrough().describe('Run identifiers, timings, and input/output hashes.'),
}).passthrough();

function addParameterDescriptions(schema: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(schema);
  function visit(node: unknown): void {
    if (typeof node !== 'object' || node === null) return;
    const value = node as Record<string, unknown>;
    const properties = value.properties;
    if (typeof properties === 'object' && properties !== null) {
      for (const [name, child] of Object.entries(properties)) {
        if (typeof child !== 'object' || child === null) continue;
        const field = child as Record<string, unknown>;
        if (!field.description && parameterDescriptions[name]) field.description = parameterDescriptions[name];
        visit(field);
      }
    }
    for (const key of ['items', '$defs', 'definitions', 'anyOf', 'oneOf', 'allOf']) {
      const child = value[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (typeof child === 'object' && child !== null) {
        if (key === '$defs' || key === 'definitions') Object.values(child).forEach(visit);
        else visit(child);
      }
    }
  }
  visit(copy);
  return copy;
}

export function publicToolDefinition(options: ToolOptions): {
  description: string;
  inputSchema: ToolOptions['inputSchema'];
  outputSchema: z.ZodTypeAny;
} {
  const description = descriptions[options.name];
  if (!description) throw new Error(`Missing public tool description: ${options.name}`);
  const standard = options.inputSchema['~standard'];
  const inputSchema = {
    '~standard': {
      ...standard,
      validate: (value: unknown, config?: unknown) => standard.validate(value, config as never),
      jsonSchema: {
        ...standard.jsonSchema,
        input: (config: Parameters<typeof standard.jsonSchema.input>[0]) =>
          addParameterDescriptions(standard.jsonSchema.input(config) as Record<string, unknown>),
      },
    },
  };
  return { description, inputSchema: inputSchema as unknown as ToolOptions['inputSchema'], outputSchema };
}

export function publicToolDocumentationCoverage(options: ToolOptions): { described: number; total: number } {
  const schema = publicToolDefinition(options).inputSchema['~standard'].jsonSchema.input({ target: 'draft-2020-12' });
  const properties = schema.properties as Record<string, { description?: string }> | undefined;
  const fields = Object.values(properties ?? {});
  return { described: fields.filter((field) => Boolean(field.description)).length, total: fields.length };
}
