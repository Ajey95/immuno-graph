# MCP Specification

## 1. Principles

ImmunoGraph exposes one NitroStack MCP server: `immunograph-mcp`.

The server contains seven internal capability modules:

1. Immunoinformatics tools
2. Evidence tools
3. Constraint tools
4. Structure tools
5. Chemistry tools
6. Docking tools
7. Report / export tools

These modules are code and contract boundaries, not independently deployed MCP servers. They share one server lifecycle, common envelopes, correlation context, and capability registry. Agent permissions are enforced with tool-level allowlists.

All tools use Zod input validation, return typed JSON, log through the execution context, and attach correlation metadata. Long-running predictor operations use NitroStack task support where the installed SDK version permits it.

MCP is a capability boundary. It does not own UI navigation or REST lifecycle transitions.

The mandatory PRD v1.1 agentic architecture is implemented inside the same NitroStack MCP server.
NitroStack Cloud still sees one deployable app, while internal agents are represented as bounded
LangGraph nodes that may select only typed ImmunoGraph tools.

```text
One ImmunoGraph MCP App
  |-- LangGraph Agent Workflow
  |-- Immunoinformatics Tools
  |-- Evidence Tools
  |-- Constraint Tools
  |-- Structure Tools
  |-- Chemistry Tools
  |-- Docking Tools
  `-- Report / Export Tools
```

LLM-backed agent mode is allowed only for planning, routing, summarization, and grounded
explanation. LLM output is never accepted as scientific evidence unless it is validated against
typed MCP tool outputs. When an LLM provider is absent, the same graph runs with deterministic
agent routing and explicit provenance.

## 2. Common envelopes

### Metadata

```ts
type ToolMeta = {
  requestId: string;
  runId: string;
  toolName: string;
  toolVersion: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  inputHash: string;
  outputHash: string;
};
```

### Connector provenance

```ts
type ConnectorProvenance = {
  connectorId: string;
  connectorVersion: string;
  method: string;
  methodVersion: string;
  status: 'LIVE' | 'CACHED' | 'SYNTHETIC' | 'FIXTURE' | 'FAILED';
  sourceUri?: string;
  cacheKey?: string;
  fixtureId?: string;
  parameters: Record<string, unknown>;
  predictionSource?: 'LIVE' | 'CACHED' | 'SYNTHETIC' | 'FIXTURE';
  scientificUse?: boolean;
  validationStatus?: 'SCIENTIFIC' | 'DEMONSTRATION_ONLY' | 'VERIFIED_FIXTURE';
  algorithm?: string;
  algorithmVersion?: string;
  datasetVersion?: string;
  datasetHash?: string;
};
```

### Success and failure

```ts
type ToolSuccess<T> = { ok: true; data: T; meta: ToolMeta };
type ToolFailure = {
  ok: false;
  error: {
    code: string;
    category: 'VALIDATION' | 'SCIENTIFIC' | 'CONNECTOR' | 'TIMEOUT' | 'RATE_LIMIT' | 'INTERNAL';
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta: Omit<ToolMeta, 'outputHash' | 'completedAt' | 'durationMs'> & Partial<ToolMeta>;
};
```

Tools return expected failures as `ToolFailure`; unexpected exceptions are mapped centrally and never expose stack traces to clients.

## 3. Prediction tools

### Purpose

Validate sequence inputs, generate T-cell peptides, and invoke registered scientific predictor connectors through the hybrid resolver.

### `validate_sequence`

**Input:** `{ fasta: string, profileVersion: string }`  
**Output:** normalized sequence, header, length, SHA-256, warnings.  
**Synchronous timeout:** 2 seconds.  
**Errors:** `FASTA_EMPTY`, `FASTA_MULTIPLE_RECORDS`, `INVALID_RESIDUE`, `SEQUENCE_TOO_LONG`, `SEQUENCE_APPEARS_NUCLEOTIDE`.

### `generate_candidate_peptides`

**Input:** sequence hash/reference, `candidateType: MHCI | MHCII`, sorted peptide lengths.  
**Output:** stable ordered candidates with one-based inclusive coordinates.  
**Timeout:** 5 seconds for the MVP maximum sequence.  
**Rule:** B-cell candidates are not accepted by this tool.

### `predict_mhci`

**Input:**

```ts
{
  runId: string;
  proteinRef: string;
  alleles: string[];
  peptideLengths: number[];
  methods: string[];
  fallbackPolicy: FallbackPolicy;
}
```

**Output:** raw prediction observations plus provenance for every requested method.  
**Task support:** required when available.  
**Live timeout:** configurable, default 120 seconds per method.  
**Retry:** maximum two retries for network/429/5xx only.  
**Authoritative adapters:** supported IEDB MHC-I API route and optional local MHCflurry MHC-I CLI connector when installed and enabled.

### `predict_mhcii`

Same contract as MHC-I with MHC-II allele and peptide-length validation. Default live timeout 180 seconds per method.

### `predict_bcell`

**Input:** run/protein reference, method list, method-specific registered parameters, fallback policy.  
**Output:** residue scores and/or mapped B-cell regions, raw method fields, provenance.  
**MVP rule:** `graphbepi` is fixture-only. The tool performs an exact approved fixture lookup and returns `FIXTURE`, or returns `FAILED` with `GRAPHBEPI_FIXTURE_NOT_FOUND`/`FIXTURE_MISMATCH`. It must never attempt a live GraphBepi process or network call, return `LIVE` or `CACHED`, or write GraphBepi output to the live-result cache. A run configuration selecting GraphBepi must use a fallback policy that permits fixtures.

### `predict_synthetic_binding`

Accepts the same canonical candidate identity fields needed by scientific binding predictors and returns deterministic binding-like demonstration values. Identical canonical inputs always produce identical outputs. The tool always returns `status=SYNTHETIC`, `predictionSource=SYNTHETIC`, `scientificUse=false`, and `validationStatus=DEMONSTRATION_ONLY` with its algorithm and dataset versions. It is not an IEDB or MHCflurry substitute.

### Resources

- `protein://{proteinId}` — canonical sequence metadata; sequence body only for authorized local execution.
- `connector://registry` — connector IDs, methods, versions, health, and enabled status.
- `prediction://{observationId}` — immutable raw observation and provenance.

## 4. Evidence tools

### Purpose

Transform validated raw observations into comparable evidence and deterministic rankings.

### `normalize_scores`

**Input:** observation IDs and normalization registry version.  
**Output:** normalized values plus transformation parameters.  
**Errors:** `NORMALIZATION_PROFILE_MISSING`, `NON_FINITE_SCORE`, `SCORE_OUT_OF_DOMAIN`.

### `compute_consensus`

**Input:** normalized observation IDs, group key, reliability weights.  
**Output:** weighted mean, variance, agreement, completeness, consensus, entropy/status.  
**Rule:** rejects incompatible evidence groups.

`compute_consensus_batch` applies the same pure algorithm to multiple independent candidate groups in one MCP call; it exists to avoid one HTTP session per candidate and does not change consensus semantics.

### `calculate_population_coverage`

**Input:** epitope/HLA associations, population IDs, class mode, fallback policy.  
**Output:** projected coverage and supporting metrics with connector provenance.  
**Rule:** does not use an LLM or an undocumented local approximation. Exact fixtures are permitted.

### `calculate_synthetic_population_coverage`

Uses only the explicitly synthetic HLA frequency dataset. It is deterministic and always reports `scientificUse=false` and `DEMONSTRATION_ONLY`. Missing synthetic population/allele combinations are returned as unavailable rather than fabricated.

### `rank_candidates`

**Input:** candidate evidence snapshot, applicable constraint snapshot, ranking profile version, and `phase: PRELIMINARY | FINAL`.  
**Output:** component scores and penalties for both phases; final scores, stable ranks, and categories only for `FINAL`.  
**Rule:** `PRELIMINARY` requires completed base constraints. `FINAL` requires completed duplicate/overlap outcomes and the final constraint snapshot.

### `optimize_shortlist_coverage`

**Input:** eligible T-cell candidate IDs, final ranking snapshot, population IDs, target coverage and/or maximum shortlist size, and population-coverage method.  
**Output:** deterministic ordered selection steps, marginal gains, cumulative coverage, and final set-level coverage with provenance.  
**Rule:** runs only after final individual ranking, rejects B-cell candidates, and uses the stable tie-break order in `ALGORITHM_SPEC.md`.

### `optimize_construct_genetic`

**Input:** ranked candidate summaries, track, construct constraints, and genetic-optimization controls.  
**Output:** deterministic construct candidate, selected epitopes, coverage/redundancy metrics, manufacturability warnings, and provenance.  
**Rule:** this is a deterministic optimization algorithm, not a biological safety or efficacy claim.

### `calibrate_confidence`

**Input:** score, evidence agreement, evidence completeness, and evidence count.  
**Output:** calibrated confidence, expected calibration error estimate, confidence label, and provenance.  
**Rule:** calibration reflects software uncertainty in the available evidence, not clinical certainty.

### Resources

- `evidence://{candidateId}`
- `ranking-profile://{version}`
- `normalization-profile://{version}`
- `population://{populationId}`
- `shortlist-optimization://{runId}/{track}`

## 5. Constraint tools

### Purpose

Apply versioned deterministic biological rules and preserve every outcome.

### `detect_overlapping_epitopes`

**Input:** compatible candidate list and overlap-profile version.  
**Output:** interval pairs, overlap ratios, and connected components.  
**Rule:** does not decide dominance until preliminary scores are supplied.

### `remove_duplicate_candidates`

**Input:** candidates and protein hash.  
**Output:** canonical candidates, duplicate links, deterministic reasons.

### `validate_thresholds`

**Input:** evidence snapshot and rule-profile version.  
**Output:** all non-overlap rule outcomes.  
**Rule:** evaluates every applicable rule; does not stop at first failure.

### `categorize_candidates`

**Input:** candidates, rule outcomes, preliminary scores, category-profile version.  
**Output:** provisional categories and blocking conditions.

### `apply_constraint_rules`

**Input:** complete evidence snapshot and rule-profile version.  
**Output:** ordered rule outcomes, duplicate/overlap decisions, final eligibility status.  
**Rule:** idempotent for the same snapshot hash.

### Resources

- `rule-profile://{version}`
- `constraint-outcome://{outcomeId}`
- `candidate-decision://{candidateId}`

## 6. Structure tools

### Purpose

Represent the mandatory Structure MCP capability inside the single NitroStack MCP app.
Current implementation is fixture-safe and fail-closed for live-only requests unless live structure
adapters are configured in a future deployment.

### Tools

- `fetch_structure`
- `validate_structure`
- `map_epitopes_to_structure`
- `calculate_surface_accessibility`
- `calculate_structure_confidence`
- `detect_binding_pockets`
- `create_molstar_view`

All outputs include source status and provenance. Fixture outputs set `scientificUse=false` unless
the source is an explicitly configured live connector.

## 7. Chemistry tools

### Purpose

Represent the mandatory Chemistry MCP capability inside the single NitroStack MCP app.
Current implementation supports deterministic compound validation, deduplication, descriptor
estimation, and ligand-preparation references with explicit fixture provenance.

### Tools

- `fetch_compound`
- `validate_compound`
- `deduplicate_compounds`
- `calculate_molecular_descriptors`
- `prepare_ligand`

Live-only PubChem/RDKit/Open Babel requests fail closed until those runtime adapters are configured.

## 8. Docking tools

### Purpose

Represent the mandatory docking capability inside the single NitroStack MCP app.
Current implementation provides deterministic fixture-safe receptor preparation, docking-box
validation, docking replay, pose clustering, and interaction extraction.

### Tools

- `prepare_receptor`
- `validate_docking_box`
- `run_docking`
- `cluster_docking_poses`
- `extract_interactions`
- `create_molstar_view`

Vina/live docking mode fails closed when the runtime is unavailable. Fixture docking output is
clearly marked as fixture-backed and not a validated live docking result.

## 9. Report / Export tools

### Purpose

Create immutable researcher-facing views and exports from approved structured data.

### `generate_report`

**Input:** approved run ID, report template version, output formats.  
**Output:** artifact metadata.  
**Required formats:** JSON and CSV.  
**Optional format:** PDF after a deterministic renderer is implemented.  
**Rule:** embeds disclaimer, provenance summary, and run quality.

### `export_candidates`

**Input:** approved run ID, candidate categories, format.  
**Output:** artifact reference and SHA-256.  
**Rule:** raw and normalized scores use separate columns/fields.

### `visualize_results`

**Input:** run ID and visualization type.  
**Output:** validated visualization view model, not an AI-generated image.  
**Types:** `SEQUENCE_MAP`, `CONNECTOR_STATUS`, `CONSTRAINT_SUMMARY`, `SCORE_DISTRIBUTION`, `EVIDENCE_GRAPH`, `WORKFLOW_GRAPH`, `POPULATION_COVERAGE`.

### `explain_candidate`

**Input:** candidate decision snapshot, audience, explanation mode.  
**Output:** deterministic explanation plus optional validated LLM paraphrase.  
**Rule:** candidate values and rule outcomes are immutable. LLM failure never fails the workflow.

### `export_workflow_trace`

**Input:** run ID and redaction profile.  
**Output:** ordered trace JSON artifact.  
**Rule:** excludes secrets, unrestricted external bodies, and hidden chain-of-thought.

### `describe_agentic_workflow`

**Input:** run ID, run intent, and whether to include future interface agents.  
**Output:** single-app deployment boundary, internal agent manifest, deterministic workflow graph, human approval gates, guardrails, and final research-package contract.  
**Rule:** read-only and deterministic. It exposes agentic capability without creating additional deployed MCP servers.

### `run_agentic_workflow`

**Input:** run ID, objective, `agentMode: LLM | DETERMINISTIC`, approved tool names, and human-approval requirement.  
**Output:** LangGraph runtime identifier, bounded ReAct-style steps, selected tools, verification decisions, approval gates, and warnings.  
**Rule:** agent nodes may route and verify; they may not invent scientific values or bypass human approval.

### `chat_with_research_agent`

**Input:** run ID, researcher question, evidence summary, requested agent mode, and audience.  
**Output:** grounded answer, cited evidence keys, limitations, whether an LLM was used, and agent mode.  
**Rule:** if evidence is missing, the answer must abstain rather than fabricate.

### `export_research_package`

**Input:** run ID, package manifest, required sections, CSV inclusion flag, and agent-trace inclusion flag.  
**Output:** artifact metadata and required-section summary for `research-package.zip`.  
**Rule:** the package must include JSON/MD artifacts and the currently generated CSV exports.

### Prompts

- `explain_candidate` — grounded explanation for `RESEARCHER` or `JUDGE` audience.
- `summarize_run` — concise report narrative from the run summary.
- `answer_evidence_question` — answers only from supplied evidence graph facts.

Prompt text is versioned in [PROMPTS.md](PROMPTS.md) and application files; prompts never contain tool credentials.

### Resources

- `run://{runId}`
- `candidate://{candidateId}`
- `artifact://{artifactId}`
- `trace://{runId}`

## 10. Observability requirements

Every call records:

- request/run/stage IDs;
- tool and `immunograph-mcp` server version;
- input/output hashes;
- duration;
- success/failure and error code;
- connector provenance when applicable;
- retry count;
- task ID and progress events for asynchronous calls.

Do not log full sequences or unbounded scientific outputs.

## 11. Idempotency

Pure tools are naturally idempotent. I/O tools accept `requestId` and a caller-supplied idempotency key. Repeated `generate_report` or connector requests with the same key return the existing successful artifact/observation unless `force=true` is explicitly allowed by the API.

## 12. Contract acceptance criteria

- All tool schemas have positive and negative Vitest cases.
- NitroStudio can invoke every tool using a documented example.
- Long-running tools report progress and honor cancellation.
- No tool returns an untyped raw provider response.
- All error codes are stable and documented in API/test fixtures.
- A fixture-backed call is visually and structurally distinguishable from a live call.
- NitroStudio exposes one server identity and all seven capability modules.
- GraphBepi contract tests prove that no live/cache execution path is reachable in the MVP.
- Structure, chemistry, and docking tools are discoverable and fail closed for live-only calls when no live runtime is configured.
