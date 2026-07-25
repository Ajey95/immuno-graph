# ImmunoGraph Studio Implementation PRD

**Status:** Approved implementation baseline  
**Version:** 1.0.0  
**Date:** 2026-07-25  
**Primary deployment goal:** One NitroStack Cloud MCP application  
**Workspace model:** Single researcher workspace; no authentication for MVP  
**Source PRD:** `ImmunoGraph_Studio_PRD_Single_Source_of_Truth.md`

---

## 1. Purpose

This document freezes the practical implementation plan for ImmunoGraph Studio.
It translates the broader single-source PRD into the current hackathon-ready
architecture, delivery order, connector strategy, agent model, and mandatory
research package deliverables.

This document does not replace the full PRD. It defines the approved MVP
implementation shape.

---

## 2. Final Architecture Decision

ImmunoGraph Studio will be implemented as an MCP-first research application.

Externally, NitroStack Cloud must see one deployable MCP application:

```text
One ImmunoGraph MCP App
```

Internally, that MCP app may contain multiple bounded agent modules, tool
groups, orchestration services, and workflow graph components.

Final approved architecture:

```text
Researcher
   ↓
ImmunoGraph Studio UI
   ↓
Fastify API
   ↓
One NitroStack MCP App
   ├── Supervisor / Orchestrator Agent
   ├── Sequence Validation Agent
   ├── Immunology Agent
   ├── Structure Agent
   ├── Compound Agent
   ├── Ranking Agent
   ├── Verifier Agent
   ├── Reporting Agent
   │
   ├── Immunoinformatics Tools
   ├── Structure Tools
   ├── Chemistry / Docking Tools
   ├── Evidence Tools
   ├── Governance Tools
   └── Report / Export Tools
```

### Rationale

This keeps deployment simple, makes the NitroStack story clear, avoids
multi-service deployment risk, and still demonstrates the core agentic
architecture.

The system must look like:

```text
one deployed MCP app
many internal scientific capabilities
bounded agents
typed tools
observable workflow graph
human approval
research package export
```

---

## 3. Explicit MVP Deviation from Full PRD

The full PRD includes authentication, role-based access, multiple deployable MCP
services, graph databases, queues, workers, structure pipelines, chemistry
pipelines, docking, conservation, and ML model training.

For the MVP:

- authentication is not required;
- role-based access is not required;
- there is one researcher workspace;
- there is one deployable NitroStack MCP app;
- internal agents and tool groups are logical modules, not separate deployed MCP
  services;
- GraphBepi remains fixture-only;
- conservation is not part of the MVP;
- toxicity and allergenicity are not part of the MVP;
- structure and chemistry agents may exist as interfaces/placeholders unless a
  specific feature is implemented;
- scientific outputs must still preserve provenance and safety labels.

This deviation is intentional and approved for hackathon delivery.

---

## 4. System Components

### 4.1 React UI

The UI is the researcher workspace.

Required areas:

- Dashboard as home/project portfolio view;
- project overview;
- workflow visualization;
- candidate rankings;
- evidence explorer;
- population coverage view;
- reports;
- downloads;
- project settings;
- system diagnostics.

The UI must consume the REST API only. It must not contain scientific business
logic.

### 4.2 Fastify API

The API owns application state and researcher workflow actions.

Responsibilities:

- project management;
- run creation;
- workflow execution entrypoints;
- approval actions;
- report retrieval;
- artifact download;
- diagnostics aggregation;
- idempotency;
- structured logging;
- persistence through repositories.

The API delegates scientific capability execution to the MCP app.

### 4.3 NitroStack MCP App

The MCP app is the main backend artifact for NitroStack Cloud.

Responsibilities:

- expose typed MCP tools;
- expose tool discovery;
- expose health checks;
- run deterministic algorithms;
- call live connectors when configured;
- apply fallback policy;
- return schema-valid outputs;
- preserve provenance;
- support internal agent orchestration.

### 4.4 Database

SQLite remains the MVP persistence layer.

Responsibilities:

- projects;
- proteins/sequences;
- workflow runs;
- workflow stages/events;
- candidates;
- predictions;
- population coverage;
- approvals;
- reports;
- artifacts;
- cache entries.

Immutable profiles remain files under `data/profiles/`. The database stores
only selected profile metadata in run snapshots:

- profile name;
- profile version;
- profile SHA-256 hash.

---

## 5. Agent Model

Agents are bounded orchestration modules, not free-form scientific guessers.

Each agent must:

- operate within an explicit scope;
- call only approved MCP tools;
- validate inputs and outputs;
- preserve provenance;
- abstain or escalate when evidence is insufficient;
- avoid fabricating scientific values;
- emit traceable decisions.

### 5.1 Supervisor / Orchestrator Agent

Owns the workflow graph.

Responsibilities:

- create the execution plan;
- decide stage order;
- coordinate parallel branches;
- manage retries;
- route failures to fallback policy;
- pause for approval gates;
- resume execution after approval;
- emit workflow trace events.

### 5.2 Sequence Validation Agent

Responsibilities:

- validate FASTA;
- normalize sequence;
- compute input hash;
- identify invalid residues;
- block invalid inputs;
- return deterministic validation evidence.

### 5.3 Immunology Agent

Responsibilities:

- generate peptides;
- request MHC-I predictions;
- request MHC-II predictions;
- request B-cell predictions;
- request population coverage;
- collect connector provenance;
- forward evidence to ranking.

### 5.4 Structure Agent

MVP role: interface-ready module.

Future responsibilities:

- structure retrieval;
- uploaded structure validation;
- AlphaFold fallback;
- structure confidence;
- epitope-to-structure mapping;
- surface accessibility.

### 5.5 Compound Agent

MVP role: interface-ready module.

Future responsibilities:

- compound retrieval;
- compound validation;
- descriptors;
- ligand preparation;
- receptor preparation;
- docking orchestration.

### 5.6 Ranking Agent

Responsibilities:

- deterministic weighted ranking;
- consensus scoring;
- missing evidence penalties;
- disagreement penalties;
- confidence calculation;
- greedy construct optimization;
- genetic algorithm construct optimization where available.

### 5.7 Verifier Agent

Responsibilities:

- check provenance completeness;
- detect unsupported claims;
- enforce research-use-only language;
- block promotion when required evidence is missing;
- require human approval before critical transitions.

### 5.8 Reporting Agent

Responsibilities:

- generate summary report;
- generate structured report JSON;
- generate CSV exports;
- include limitations;
- include approvals;
- include evidence links;
- assemble the final research package ZIP.

---

## 6. MCP Tool Groups

The single NitroStack MCP app must organize tools into logical groups.

### 6.1 Immunoinformatics Tools

Required MVP tools:

- `validate_sequence`;
- `generate_candidate_peptides`;
- `predict_mhci`;
- `predict_mhcii`;
- `predict_bcell`;
- `predict_synthetic_binding`;
- `calculate_population_coverage`;
- `calculate_synthetic_population_coverage`.

### 6.2 Evidence Tools

Required MVP tools:

- `normalize_scores`;
- `compute_consensus`;
- `compute_consensus_batch`;
- `explain_candidate`;
- `visualize_results`;
- `export_workflow_trace`.

### 6.3 Governance Tools

Required MVP tools:

- `validate_thresholds`;
- `apply_constraint_rules`;
- `remove_duplicate_candidates`;
- `detect_overlapping_epitopes`;
- `categorize_candidates`.

### 6.4 Ranking and Construct Tools

Required MVP tools:

- `rank_candidates`;
- `optimize_shortlist_coverage`.

### 6.5 Report and Export Tools

Required MVP tools:

- `generate_report`;
- `export_candidates`.

### 6.6 Structure Tools

MVP state: placeholders/interfaces are acceptable unless implemented.

Future tools:

- retrieve structure;
- validate structure;
- map epitope to structure;
- calculate surface accessibility;
- structure confidence.

### 6.7 Chemistry / Docking Tools

MVP state: placeholders/interfaces are acceptable unless implemented.

Future tools:

- retrieve PubChem compounds;
- validate compound;
- prepare ligand;
- prepare receptor;
- validate docking box;
- run Vina;
- cluster poses;
- extract interactions.

---

## 7. Connector Policy

The system must support transparent execution modes.

```text
LIVE
SYNTHETIC
FIXTURE
HYBRID
```

### 7.1 Live Connectors

Approved live connector strategy:

```text
Primary live connector: IEDB HTTP
Optional local/live connector: MHCflurry
Population coverage: IEDB official standalone tool or configured compatible endpoint
Demo-safe fallback: Synthetic + fixtures
GraphBepi: fixture-only for MVP
```

### 7.2 Binding Predictions

Execution order:

```text
Cache
  ↓
IEDB live, if enabled
  ↓
MHCflurry local, if requested and enabled for MHC-I
  ↓
Synthetic, if policy permits
  ↓
Fixture, if policy permits
  ↓
Fail closed
```

### 7.3 Population Coverage

IEDB does not expose population coverage through the same stable REST Tools API
contract as MHC binding. The approved live path is:

```text
IEDB official standalone Python package
```

The connector is enabled with:

```env
IEDB_POPULATION_COVERAGE_ENABLED=true
IEDB_POPULATION_COVERAGE_SCRIPT_PATH=/opt/iedb/population_coverage/calculate_population_coverage.py
IEDB_POPULATION_COVERAGE_PYTHON_COMMAND=python3
```

Optional compatible HTTP endpoint remains supported:

```env
IEDB_POPULATION_COVERAGE_URL=https://configured-compatible-endpoint.example/api
```

### 7.4 MHCflurry

MHCflurry is optional.

It is enabled only when the runtime has:

- Python;
- MHCflurry CLI;
- downloaded prediction models.

```env
MHCFLURRY_ENABLED=true
MHCFLURRY_COMMAND=mhcflurry-predict-scan
```

### 7.5 GraphBepi

GraphBepi remains fixture-only for MVP.

Reason:

- avoids dependency/runtime risk;
- keeps B-cell branch demonstrable;
- preserves transparent provenance;
- avoids pretending a live structure-aware predictor exists when it is not
  packaged.

---

## 8. Synthetic Mode

Synthetic mode is required for offline demonstration and resilient workflow
execution.

Synthetic values must come from deterministic MCP tools, not hardcoded UI
values.

Required synthetic provenance:

```json
{
  "predictionSource": "SYNTHETIC",
  "scientificUse": false,
  "validationStatus": "DEMONSTRATION_ONLY"
}
```

Synthetic values are allowed only when clearly labeled.

The UI, API responses, reports, and exports must make it impossible to mistake
synthetic predictions for scientific predictions.

---

## 9. Fixture Mode

Fixture mode replays approved deterministic fixture cases.

Fixtures must include:

- input protein;
- generated peptides;
- prediction scores;
- consensus;
- expected ranking;
- expected report.

Fixture outputs must be labeled:

```text
predictionSource = FIXTURE
validationStatus = VERIFIED_FIXTURE
```

---

## 10. Human Approval Gates

Authentication is excluded for MVP, but human approval actions remain required
workflow state transitions.

Required MVP approvals:

- configuration approval before execution;
- shortlist approval before report/construct generation;
- final export approval where implemented.

Approval records must include:

- approval ID;
- run ID;
- approval type;
- decision;
- comment when provided;
- timestamp;
- affected entities.

---

## 11. Mandatory Research Package Export

The final research package ZIP is a must-have deliverable.

The existing CSV reports are also mandatory. CSV files must be included
alongside JSON and Markdown artifacts.

Required package layout:

```text
research-package.zip
├── manifest.json
├── project.json
├── run.json
├── configuration.json
├── inputs/
│   ├── original-fasta.fasta
│   ├── normalized-sequence.json
│   └── input-checksums.json
├── predictions/
│   ├── mhci.json
│   ├── mhcii.json
│   ├── bcell.json
│   ├── population-coverage.json
│   └── connector-provenance.json
├── candidates/
│   ├── ranked-candidates.json
│   ├── shortlisted-candidates.json
│   ├── rejected-candidates.json
│   ├── candidate-evidence-links.json
│   └── candidates.csv
├── construct/
│   ├── construct.fasta
│   ├── construct.json
│   └── construct-optimization.json
├── evidence/
│   ├── evidence-graph.json
│   ├── workflow-trace.json
│   ├── approvals.json
│   └── audit-events.json
├── reports/
│   ├── summary.md
│   ├── report.json
│   ├── limitations.md
│   └── report.csv
└── checksums.json
```

### 11.1 Package Requirements

Every package must include:

- machine-readable manifest;
- package creation timestamp;
- application version;
- specification version;
- run ID;
- project ID;
- execution mode;
- connector statuses;
- source/provenance for every prediction;
- approvals;
- warnings;
- limitations;
- SHA-256 checksum for every file.

### 11.2 Report Language

Reports must use research-safe language.

Required limitation when synthetic values contributed:

```text
This analysis includes deterministic synthetic demonstration outputs. These
values are intended to demonstrate workflow orchestration and must not be
interpreted as validated biological predictions.
```

Required limitation for all exports:

```text
This package contains computational research outputs only. It is not clinical
validation, vaccine efficacy evidence, treatment advice, or a replacement for
experimental validation.
```

---

## 12. Dashboard and UI Decisions

Dashboard is the home screen and project portfolio view.

Dashboard responsibilities:

- project list;
- number of projects;
- recent runs;
- running/completed/failed workflows;
- quick actions;
- connector health summary.

Dashboard must not become a deep analytics page.

Project-level Settings manage analysis configuration for the current project:

- run configuration;
- profiles;
- constraints;
- output preferences.

System Diagnostics is separate and read-only:

- connector status;
- runtime health;
- fixture manifests;
- loaded profile versions;
- build/application information.

Project Settings must not expose infrastructure diagnostics. System Diagnostics
must not modify project-specific analysis configuration.

---

## 13. Deterministic Algorithms Required in MVP

Required pure algorithms:

- FASTA validation;
- peptide generation;
- normalization;
- consensus calculation;
- duplicate detection;
- overlap detection;
- hard constraints;
- preliminary scoring;
- overlap resolution;
- final ranking;
- confidence calculation;
- greedy coverage optimization;
- genetic algorithm construct optimization.

Duplicate detection rule:

```text
proteinHash | candidateType | start | end | peptide | allele
```

Identical peptide sequences at different coordinates must remain distinct
candidates.

---

## 14. Ranking and Optimization Scope

MVP ranking uses deterministic weighted scoring.

Frozen MVP v1.0 T-cell weights:

```text
Binding: 0.40
Consensus: 0.30
Population Coverage: 0.20
Completeness: 0.10
```

Frozen MVP v1.0 B-cell weights:

```text
GraphBepi: 0.90
Completeness: 0.10
```

Implemented or targeted MVP optimization features:

- better population coverage;
- greedy construct optimization;
- genetic algorithm construct optimization;
- redundancy minimization;
- coverage maximization;
- manufacturability constraints;
- confidence calibration.

ML ranking remains future/Phase 2 unless explicitly implemented with a real
versioned model and evaluation data.

---

## 15. Data Policy

Local data is allowed and required for demo resilience.

Required local data categories:

- HLA allele reference;
- biological constraint configuration;
- amino-acid dictionary;
- FASTA validation rules;
- synthetic demo proteins;
- example prediction outputs;
- fixture manifests;
- profile files.

If real data cannot be safely included, synthetic data may be used only when:

- it has the same schema as real data;
- it is labeled synthetic;
- `scientificUse=false`;
- it is never represented as validated biological evidence.

---

## 16. Deployment Target

Primary deployment:

```text
NitroStack Cloud
└── apps/mcp
```

The MCP app must:

- support HTTP transport;
- expose health endpoint;
- expose MCP tool discovery;
- expose MCP message endpoint;
- use `PORT` from environment;
- bind to `0.0.0.0` in production;
- package shared algorithms and local data;
- install/configure required live connector runtime dependencies where feasible.

Recommended production environment:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
MCP_TRANSPORT_TYPE=dual
IEDB_LIVE_ENABLED=true
IEDB_POPULATION_COVERAGE_ENABLED=true
IEDB_POPULATION_COVERAGE_SCRIPT_PATH=/opt/iedb/population_coverage/calculate_population_coverage.py
IEDB_POPULATION_COVERAGE_PYTHON_COMMAND=python3
MHCFLURRY_ENABLED=false
GRAPHBEPI_MODE=fixture
EXECUTION_MODE=HYBRID
DEMO_MODE=true
```

Web/API may be deployed separately from NitroStack Cloud unless NitroStack
explicitly supports full-stack hosting.

---

## 17. Acceptance Criteria

Implementation is acceptable when:

1. One NitroStack MCP app deploys successfully.
2. MCP tools are discoverable.
3. API can execute a workflow through MCP.
4. Live IEDB binding connector works when enabled.
5. IEDB population coverage standalone connector works when configured.
6. MHCflurry works when installed and enabled.
7. GraphBepi remains clearly fixture-only.
8. Synthetic mode is clearly labeled and deterministic.
9. Fixture fallback works and is transparent.
10. Workflow graph shows meaningful populated state.
11. Evidence explorer shows meaningful populated state.
12. Candidate review and shortlist approval work.
13. Reports generate after approval.
14. Existing CSV report downloads remain available.
15. Research package ZIP contains every mandatory file listed in this document.
16. `checksums.json` contains SHA-256 hashes for package files.
17. Reports include limitations and provenance.
18. System Diagnostics accurately reports connector health.
19. No clinical, efficacy, treatment, or unsupported biological claims are made.

---

## 18. Recommended Implementation Order

1. Freeze this implementation PRD and decision records.
2. Update report/export contracts for the mandatory research package ZIP.
3. Implement package assembler service.
4. Add checksum manifest generation.
5. Add API endpoint or extend existing artifact download for package export.
6. Add MCP report/export tool support if missing.
7. Add UI download action for the package.
8. Add integration tests for package contents.
9. Add NitroStack cloud deployment validation.
10. Rehearse demo end-to-end using live, synthetic, and fixture paths.

---

## 19. Non-Negotiables

- Do not split deployment into multiple MCP services for MVP.
- Do not add auth for MVP.
- Do not silently fallback without provenance.
- Do not invent scientific outputs through an LLM.
- Do not label synthetic outputs as scientific.
- Do not remove existing CSV exports.
- Do not omit the research package ZIP.
- Do not claim clinical or experimental validation.

---

## 20. Final Product Story

ImmunoGraph Studio is a NitroStack-native, MCP-first scientific orchestration
workspace.

It lets a researcher run an auditable computational immunology workflow, inspect
candidate evidence, approve critical transitions, and export a complete
research package with provenance, limitations, CSV tables, JSON artifacts,
workflow trace, approvals, and checksums.

The strongest demo story is:

```text
One NitroStack MCP app coordinates bounded scientific agents,
calls typed tools,
uses live connectors when available,
falls back transparently when needed,
preserves provenance,
requires researcher approval,
and exports a complete research package.
```

