# ImmunoGraph Studio Implementation PRD

**Status:** Approved implementation baseline  
**Version:** 1.1.0  
**Date:** 2026-07-25  
**Primary deployment goal:** One NitroStack Cloud MCP application  
**Workspace model:** Single researcher workspace; no authentication for current build  
**Source PRD:** `ImmunoGraph_Studio_PRD_Single_Source_of_Truth.md`

---

## 1. Purpose

This document freezes the current implementation direction for ImmunoGraph
Studio.

Version 1.1.0 supersedes the earlier simplified MVP interpretation. The system
must now strictly adapt the original PRD's AI-agentic methodology while keeping
the hackathon deployment goal intact:

```text
One deployable NitroStack MCP app.
```

The product is not just a deterministic dashboard and not just a chatbot. It is
a NitroStack-native, MCP-first, AI-agentic scientific orchestration system.

---

## 2. Final Architecture Decision

Externally, NitroStack Cloud must see one deployable MCP application:

```text
One ImmunoGraph MCP App
```

Internally, that one MCP app contains:

- a LangGraph AI-agent workflow;
- bounded LLM-capable agents;
- deterministic fallback routing;
- typed ImmunoGraph tool modules;
- connector adapters;
- approval gates;
- audit/provenance capture;
- report and research-package export.

Final approved architecture:

```text
Researcher
   |
   v
ImmunoGraph Studio UI / Chatbot
   |
   v
Fastify API
   |
   v
One NitroStack MCP App
   |
   v
LangGraph AI Agent Workflow
   |-- Supervisor Agent
   |-- Intake / Policy Agent
   |-- T-Cell Agent
   |-- B-Cell Agent
   |-- Population Agent
   |-- Structure Agent
   |-- Compound Intelligence Agent
   |-- Docking Agent
   |-- Ranking Agent
   |-- Verifier / Critic Agent
   `-- Reporting Agent
   |
   v
Typed ImmunoGraph MCP Tool Modules
   |-- Immunoinformatics Tools
   |-- Structure Tools
   |-- Chemistry Tools
   |-- Docking Tools
   |-- Evidence / Governance Tools
   `-- Report / Export Tools
```

LangGraph is not deployed as a separate service. It runs inside the one
NitroStack MCP app.

The Fastify API and React UI may be deployed separately, but the primary
hackathon artifact remains the NitroStack MCP app.

---

## 3. Agentic Capability Decision

Agentic capability is mandatory.

LangGraph orchestration is mandatory.

LLM-backed agent mode is mandatory when credentials are configured.

Deterministic agent routing remains mandatory as a reliability fallback.

```text
If LLM_ENABLED=true and credentials are valid:
  use LLM-backed bounded agents.

If LLM is unavailable, times out, or credentials are missing:
  continue with deterministic LangGraph routing where safe.

If required scientific evidence is unavailable:
  abstain, fail closed, or request human approval.
```

The LLM is allowed to:

- plan workflow steps;
- choose among permitted tools;
- summarize structured evidence;
- explain provenance and limitations;
- review completeness;
- recommend retry/fallback/abstention;
- draft report narrative from stored evidence;
- answer chatbot questions grounded in the evidence graph.

The LLM is not allowed to:

- invent binding scores;
- invent B-cell scores;
- invent population coverage values;
- invent docking results;
- invent structure confidence;
- bypass typed tools;
- bypass human approval gates;
- hide synthetic/fixture provenance;
- claim experimental, clinical, efficacy, treatment, or safety validation.

Scientific values must come only from typed tools, live connectors, cached
connector results, deterministic synthetic demonstration tools, or approved
fixtures.

---

## 4. Bounded ReAct Methodology

Every AI agent follows the original PRD's bounded ReAct loop:

```text
1. PLAN    Select one permitted next action.
2. ACT     Invoke one typed MCP tool or request approval.
3. OBSERVE Receive structured output and provenance.
4. VERIFY  Validate schema, provenance, and scientific gates.
5. DECIDE  Continue, retry, route, request approval, reject, or abstain.
```

Default iteration limits:

- ordinary agent: 3 iterations;
- supervisor agent: 5 iterations;
- verifier/critic agent: 3 iterations;
- reporting agent: 2 iterations.

The platform must prevent:

- infinite loops;
- recursive agent spawning;
- hidden tool calls;
- repeated identical calls without changed input;
- unbounded context growth;
- large raw artifacts inside LLM prompts.

Every agent step must emit an audit event containing:

- agent ID;
- iteration number;
- selected action;
- tool name when applicable;
- input hash;
- output hash;
- validation result;
- next decision;
- termination reason when applicable.

---

## 5. Required Agents

Every agent must define:

- role;
- allowed tools;
- forbidden actions;
- input schema;
- output schema;
- maximum iterations;
- context budget;
- retry policy;
- abstention conditions;
- evaluation tests.

### 5.1 Supervisor Agent

Owns the LangGraph workflow.

Responsibilities:

- create the execution plan;
- assign tasks to bounded agents;
- manage dependencies and parallel branches;
- manage retries and fallback routing;
- pause for approval gates;
- resume after approval;
- terminate safely;
- emit workflow trace events.

Forbidden:

- invent scientific values;
- directly modify scientific outputs without tool evidence.

### 5.2 Intake / Policy Agent

Responsibilities:

- validate objective;
- validate workflow mode;
- validate project configuration;
- check required profiles and connector policy;
- prepare configuration approval summary;
- block execution when required configuration is missing.

### 5.3 T-Cell Agent

Responsibilities:

- generate MHC-I and MHC-II peptide candidates;
- call MHC-I/MHC-II prediction tools;
- manage HLA settings;
- collect connector provenance;
- store T-cell evidence.

### 5.4 B-Cell Agent

Responsibilities:

- call B-cell prediction tools;
- use GraphBepi fixture-only path for current build unless a validated live
  connector is added later;
- calculate agreement where multiple B-cell evidence sources exist;
- flag missing or conflicting evidence.

### 5.5 Population Agent

Responsibilities:

- validate population configuration;
- call population coverage tools;
- calculate marginal contribution;
- preserve HLA frequency provenance;
- identify coverage gaps.

### 5.6 Structure Agent

Structure support is mandatory in the current target architecture.

Responsibilities:

- retrieve structures from configured sources;
- validate uploaded or retrieved structures;
- map candidate epitopes to structure coordinates;
- calculate surface accessibility;
- calculate structure confidence;
- flag low-confidence regions;
- preserve structure source/version/provenance.

### 5.7 Compound Intelligence Agent

Chemistry support is mandatory in the current target architecture.

Responsibilities:

- retrieve compounds from configured sources;
- deduplicate compounds;
- validate compound records;
- calculate molecular descriptors;
- prepare ligand inputs for docking;
- preserve compound source/version/provenance.

### 5.8 Docking Agent

Docking support is mandatory in the current target architecture.

Responsibilities:

- prepare receptor inputs;
- validate docking boxes;
- run docking when local/runtime dependencies are configured;
- support fixture/cached docking replay for demo resilience;
- cluster docking poses;
- extract interactions;
- calculate pose stability;
- flag unstable or low-confidence docking results.

### 5.9 Ranking Agent

Responsibilities:

- request deterministic ranking;
- request ML/calibrated ranking only when a versioned model is configured;
- preserve ranking components;
- preserve confidence calibration values;
- perform construct optimization;
- never override failed hard gates.

### 5.10 Verifier / Critic Agent

Responsibilities:

- check schemas;
- check provenance completeness;
- detect unsupported claims;
- detect predictor disagreement;
- check approval compliance;
- decide pass/retry/reject/abstain;
- block final report generation when required gates fail.

### 5.11 Reporting Agent

Responsibilities:

- generate explanations only from stored evidence;
- generate structured reports;
- generate CSV exports;
- include limitations;
- include approvals;
- include evidence links;
- assemble the final research package ZIP.

Forbidden:

- create new scientific facts during reporting.

---

## 6. MCP Tool Modules

The single NitroStack MCP app must organize tools into logical modules. These
are not separately deployed MCP servers.

### 6.1 Immunoinformatics Tools

Required tools:

- `validate_sequence`;
- `generate_candidate_peptides`;
- `predict_mhci`;
- `predict_mhcii`;
- `predict_bcell`;
- `predict_synthetic_binding`;
- `calculate_population_coverage`;
- `calculate_synthetic_population_coverage`.

### 6.2 Structure Tools

Required tools:

- `fetch_structure`;
- `validate_structure`;
- `map_epitopes_to_structure`;
- `calculate_surface_accessibility`;
- `calculate_structure_confidence`;
- `detect_binding_pockets`;
- `create_molstar_view`.

Preferred live sources:

- RCSB PDB API;
- AlphaFold DB API;
- fpocket;
- FreeSASA / DSSP;
- Mol* view-state generation.

Fallback:

- cache;
- approved structure fixtures;
- fail closed when no validated structure path exists.

### 6.3 Chemistry Tools

Required tools:

- `fetch_compound`;
- `validate_compound`;
- `deduplicate_compounds`;
- `calculate_molecular_descriptors`;
- `prepare_ligand`.

Preferred live sources/dependencies:

- PubChem API;
- RDKit when available;
- Open Babel when available.

Fallback:

- cache;
- approved compound fixtures;
- fail closed when required chemistry support is unavailable.

### 6.4 Docking Tools

Required tools:

- `prepare_receptor`;
- `validate_docking_box`;
- `run_docking`;
- `cluster_docking_poses`;
- `extract_interactions`;
- `create_molstar_view`.

Preferred dependencies:

- AutoDock Vina;
- Open Babel;
- RDKit;
- PLIP;
- Mol* view-state generation;
- local structure/ligand preparation tools.

Fallback:

- cache;
- approved docking fixtures;
- fail closed when docking dependencies are unavailable and no exact fixture
  exists.

### 6.5 Evidence / Governance Tools

Required tools:

- `normalize_scores`;
- `compute_consensus`;
- `compute_consensus_batch`;
- `explain_candidate`;
- `visualize_results`;
- `export_workflow_trace`;
- `validate_thresholds`;
- `apply_constraint_rules`;
- `remove_duplicate_candidates`;
- `detect_overlapping_epitopes`;
- `categorize_candidates`.

### 6.6 Ranking and Construct Tools

Required tools:

- `rank_candidates`;
- `optimize_shortlist_coverage`;
- `optimize_construct_genetic`;
- `calibrate_confidence`.

### 6.7 Report and Export Tools

Required tools:

- `generate_report`;
- `export_candidates`;
- `describe_agentic_workflow`;
- `run_agentic_workflow`;
- `chat_with_research_agent`;
- `export_research_package`.

---

## 7. Connector and Execution Policy

The system must support transparent execution modes:

```text
LIVE
CACHED
SYNTHETIC
FIXTURE
HYBRID
FAILED
ABSTAINED
```

### 7.1 Binding Prediction Order

```text
Cache
  |
  v
IEDB live, if enabled
  |
  v
MHCflurry local, if requested and enabled for MHC-I
  |
  v
Synthetic demonstration, if policy permits
  |
  v
Exact fixture, if policy permits
  |
  v
Fail closed / abstain
```

### 7.2 Population Coverage

Approved live path:

```text
IEDB official standalone population coverage package
```

Compatible HTTP endpoint support may remain configurable, but it must not be
treated as the official IEDB binding Tools API.

### 7.3 GraphBepi

GraphBepi remains fixture-only until a validated live runtime is packaged and
documented.

### 7.4 Structure, Chemistry, and Docking

Structure, chemistry, and docking are now mandatory target capabilities.

They may use live tools when configured, but they must always preserve the same
fallback transparency:

```text
Live tool
  |
  v
Cache
  |
  v
Approved fixture replay
  |
  v
Fail closed / abstain
```

No LLM may fabricate structure, chemistry, or docking results.

---

## 8. Synthetic and Fixture Policy

Synthetic mode remains allowed for demonstration resilience only.

Synthetic outputs must include:

```json
{
  "predictionSource": "SYNTHETIC",
  "scientificUse": false,
  "validationStatus": "DEMONSTRATION_ONLY"
}
```

Fixture outputs must include:

```text
predictionSource = FIXTURE
validationStatus = VERIFIED_FIXTURE
```

The UI, chatbot, API responses, MCP outputs, reports, CSV exports, and research
package must make it impossible to mistake synthetic or fixture outputs for live
scientific predictions.

---

## 9. Human Approval Gates

Authentication is excluded for the current build, but human approval actions
remain required workflow state transitions.

Required approvals:

- configuration approval before execution;
- shortlist approval before report/construct generation;
- docking approval before docking execution when docking is enabled;
- final export approval before final research-package export.

Approval records must include:

- approval ID;
- run ID;
- approval type;
- decision;
- comment when provided;
- timestamp;
- affected entities;
- invalidation status when upstream evidence changes.

---

## 10. Mandatory Research Package Export

The final research package ZIP is mandatory.

Existing CSV reports are also mandatory.

Required package layout:

```text
research-package.zip
|-- manifest.json
|-- project.json
|-- run.json
|-- configuration.json
|-- inputs/
|   |-- original-fasta.fasta
|   |-- normalized-sequence.json
|   `-- input-checksums.json
|-- predictions/
|   |-- mhci.json
|   |-- mhcii.json
|   |-- bcell.json
|   |-- population-coverage.json
|   `-- connector-provenance.json
|-- candidates/
|   |-- ranked-candidates.json
|   |-- shortlisted-candidates.json
|   |-- rejected-candidates.json
|   |-- candidate-evidence-links.json
|   `-- candidates.csv
|-- structure/
|   |-- structures.json
|   |-- epitope-structure-map.json
|   |-- surface-accessibility.json
|   `-- structure-confidence.json
|-- compounds/
|   |-- compounds.json
|   |-- descriptors.json
|   `-- ligand-preparation.json
|-- docking/
|   |-- receptor.pdbqt
|   |-- ligand.pdbqt
|   |-- docking-output.pdbqt
|   |-- docking-poses.json
|   |-- docking-summary.json
|   |-- docking-provenance.json
|   `-- docking-view.png
|-- construct/
|   |-- construct.fasta
|   |-- construct.json
|   `-- construct-optimization.json
|-- evidence/
|   |-- evidence-graph.json
|   |-- workflow-trace.json
|   |-- agent-trace.json
|   |-- approvals.json
|   `-- audit-events.json
|-- reports/
|   |-- summary.md
|   |-- report.json
|   |-- limitations.md
|   `-- report.csv
`-- checksums.json
```

Every package must include:

- machine-readable manifest;
- package creation timestamp;
- application version;
- specification version;
- run ID;
- project ID;
- execution mode;
- agent trace;
- connector statuses;
- source/provenance for every prediction and docking output;
- approvals;
- warnings;
- limitations;
- SHA-256 checksum for every file.

---

## 11. UI and Chatbot Decisions

The UI remains the researcher workspace.

Required areas:

- Dashboard as home/project portfolio view;
- project overview;
- workflow visualization;
- candidate rankings;
- evidence explorer;
- population coverage view;
- structure view;
- compound view;
- docking view;
- construct view;
- reports/downloads;
- project settings;
- system diagnostics;
- chatbot/research assistant panel.

The UI must consume the REST API only. It must not contain scientific business
logic.

The chatbot must call API/MCP-backed agent workflows. It must not answer
scientific questions from unstored context or unsupported LLM inference.

---

## 12. Data and Persistence

SQLite remains the current persistence layer unless the full PRD storage stack
is explicitly implemented.

Required persisted state:

- projects;
- proteins/sequences;
- workflow runs;
- LangGraph checkpoints or equivalent workflow checkpoints;
- agent step events;
- workflow stages/events;
- candidates;
- predictions;
- structures;
- compounds;
- docking runs and poses;
- population coverage;
- approvals;
- reports;
- artifacts;
- cache entries.

Immutable profiles remain files under `data/profiles/`. The database stores
selected profile metadata in run snapshots:

- profile name;
- profile version;
- profile SHA-256 hash.

---

## 13. Algorithms and Ranking

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
- genetic algorithm construct optimization;
- redundancy minimization;
- coverage maximization;
- manufacturability checks;
- docking pose clustering;
- interaction summarization from structured docking outputs.

Duplicate detection rule:

```text
proteinHash | candidateType | start | end | peptide | allele
```

Identical peptide sequences at different coordinates must remain distinct
candidates.

Frozen current T-cell weights:

```text
Binding: 0.40
Consensus: 0.30
Population Coverage: 0.20
Completeness: 0.10
```

Frozen current B-cell weights:

```text
GraphBepi: 0.90
Completeness: 0.10
```

Learned ranking is allowed only when there is a versioned model, stored model
metadata, validation metrics, and deterministic fallback.

---

## 14. Deployment Target

Primary deployment:

```text
NitroStack Cloud
`-- apps/mcp
```

The MCP app must:

- support HTTP transport;
- expose health endpoint;
- expose MCP tool discovery;
- expose MCP message endpoint;
- use `PORT` from environment;
- bind to `0.0.0.0` in production;
- package shared algorithms and local data;
- run LangGraph inside the MCP process;
- support LLM-backed agent mode when configured;
- install/configure required live connector/runtime dependencies where feasible.

Required environment shape:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
MCP_TRANSPORT_TYPE=dual

AGENT_MODE=LLM
LLM_ENABLED=true
OPENAI_API_KEY=
LLM_MODEL=
LLM_TIMEOUT_MS=30000

IEDB_LIVE_ENABLED=true
IEDB_POPULATION_COVERAGE_ENABLED=true
IEDB_POPULATION_COVERAGE_SCRIPT_PATH=/opt/iedb/population_coverage/calculate_population_coverage.py
IEDB_POPULATION_COVERAGE_PYTHON_COMMAND=python3

MHCFLURRY_ENABLED=false
GRAPHBEPI_MODE=fixture

STRUCTURE_ENABLED=true
RCSB_PDB_ENABLED=true
ALPHAFOLD_DB_ENABLED=true
FPOCKET_ENABLED=true
FPOCKET_COMMAND=fpocket
FREESASA_ENABLED=true
FREESASA_COMMAND=freesasa
MOLSTAR_ENABLED=true

CHEMISTRY_ENABLED=true
PUBCHEM_ENABLED=true
RDKIT_ENABLED=true
RDKIT_PYTHON_COMMAND=python3
OPENBABEL_ENABLED=true
OPENBABEL_COMMAND=obabel

DOCKING_ENABLED=true
VINA_ENABLED=true
VINA_COMMAND=vina
PLIP_ENABLED=true
PLIP_COMMAND=plipcmd
DOCKING_FIXTURE_FALLBACK_ENABLED=true

EXECUTION_MODE=HYBRID
DEMO_MODE=true
```

For local and judge demo resilience, `AGENT_MODE=DETERMINISTIC` and
`LLM_ENABLED=false` must still allow the workflow to run where safe.

---

## 15. Acceptance Criteria

Implementation is acceptable when:

1. One NitroStack MCP app deploys successfully.
2. MCP tools are discoverable.
3. LangGraph agent workflow runs inside the MCP app.
4. LLM-backed agent mode works when credentials are configured.
5. Deterministic fallback mode works when LLM is unavailable.
6. Every agent follows the bounded PLAN/ACT/OBSERVE/VERIFY/DECIDE loop.
7. API can execute a workflow through MCP.
8. Chatbot can invoke the agent workflow through the API.
9. Live IEDB binding connector works when enabled.
10. IEDB population coverage standalone connector works when configured.
11. MHCflurry works when installed and enabled.
12. GraphBepi remains clearly fixture-only unless a validated live connector is
    added.
13. Structure tools work through live/cache/fixture/fail-closed policy.
14. Chemistry tools work through live/cache/fixture/fail-closed policy.
15. Docking tools work through live/cache/fixture/fail-closed policy.
16. Synthetic mode is clearly labeled and deterministic.
17. Fixture fallback works and is transparent.
18. Workflow graph shows meaningful populated state.
19. Evidence explorer shows meaningful populated state.
20. Candidate review and shortlist approval work.
21. Docking approval works when docking is enabled.
22. Reports generate after approval.
23. Existing CSV report downloads remain available.
24. Research package ZIP contains every mandatory file listed in this document.
25. `checksums.json` contains SHA-256 hashes for package files.
26. Reports include limitations and provenance.
27. Agent trace is exported.
28. System Diagnostics accurately reports connector, agent, LLM, structure,
    chemistry, docking, fixture, profile, and build health.
29. No clinical, efficacy, treatment, or unsupported biological claims are made.

---

## 16. Recommended Implementation Order

1. Freeze this v1.1 implementation PRD and decision records.
2. Add LangGraph runtime inside `apps/mcp`.
3. Add `AgentRuntime`, `LlmAgentRuntime`, and `DeterministicAgentRuntime`.
4. Add bounded agent manifests and policy guards.
5. Implement `run_agentic_workflow`.
6. Implement `chat_with_research_agent`.
7. Persist agent step events and workflow checkpoints.
8. Add structure tool contracts and fixture/live adapters.
9. Add chemistry tool contracts and fixture/live adapters.
10. Add docking tool contracts and fixture/local adapters.
11. Extend evidence graph, reports, and research package export with structure,
    chemistry, docking, and agent trace.
12. Update UI for chatbot, structure, chemistry, docking, and agent trace.
13. Add tests for agent routing, tool permission enforcement, LLM fallback,
    structure tools, chemistry tools, docking tools, approvals, and exports.
14. Validate NitroStack Cloud deployment.
15. Rehearse live, cached, synthetic, and fixture demos.

---

## 17. Non-Negotiables

- Do not split deployment into multiple MCP services for the current build.
- Do not remove NitroStack MCP as the primary deployment artifact.
- Do not add auth unless explicitly re-approved.
- Do not silently fallback without provenance.
- Do not invent scientific outputs through an LLM.
- Do not label synthetic outputs as scientific.
- Do not skip human approval gates.
- Do not hide fixture-only branches.
- Do not omit structure, chemistry, or docking from the target implementation.
- Do not remove existing CSV exports.
- Do not omit the research package ZIP.
- Do not claim clinical, efficacy, treatment, or experimental validation.

---

## 18. Final Product Story

ImmunoGraph Studio is a NitroStack-native, MCP-first, AI-agentic scientific
orchestration workspace.

It lets a researcher run an auditable computational immunology, structure,
chemistry, and docking workflow. A LangGraph supervisor coordinates bounded
LLM-capable agents inside one NitroStack MCP app. Each agent follows a
PLAN/ACT/OBSERVE/VERIFY/DECIDE loop, calls only approved typed tools, preserves
provenance, pauses for human approval, and abstains instead of fabricating
scientific results.

The strongest demo story is:

```text
One NitroStack MCP app runs a LangGraph AI-agent workflow,
coordinates bounded scientific agents,
calls typed MCP tools,
uses live connectors when available,
falls back transparently when needed,
preserves provenance,
requires researcher approval,
and exports a complete research package.
```
