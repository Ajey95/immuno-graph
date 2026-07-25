# Implementation Checklist

This checklist mirrors [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Check an item only after its acceptance test passes.

## Current Verification Snapshot - 2026-07-25

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run build`: passed.
- `npm run test`: passed, 67 test files and 282 tests.
- `npm run db:seed`: passed on the default local database.
- `npm run db:migrate`: passed against a clean temporary SQLite database. The default `packages/database/prisma/immunograph.db` was locked during one verification attempt, which usually means a local API/dev process or SQLite handle was still open.
- `npm run connectors:check:iedb`: passed against the live IEDB MHC-I tools API.
- `npm run connectors:check:mhcflurry`: passed against the local `.venv-mhcflurry` install.
- `npm run connectors:check:iedb-population`: passed against the local IEDB official standalone population-coverage package.

Implementation status summary: the offline fixture/synthetic path, REST API, MCP tools, MCP-visible PRD v1.1 agentic workflow descriptor, bounded LangGraph agent workflow, database repositories, core algorithms, project dashboard, workflow graph, evidence graph, candidate review, shortlist approval, diagnostics, JSON/CSV report artifacts, mandatory research-package ZIP export with checksums, evidence-graph/workflow-trace artifact exports, fixture-labeled docking PDBQT/JSON/PNG package artifacts, API liveness probe, API-owned `LIVE -> CACHED` reuse, IEDB MHC-I/MHC-II live adapters, optional local MHCflurry MHC-I adapter, official IEDB standalone population-coverage adapter, mixed-method hybrid routing, and live-capable RCSB/AlphaFold/PubChem/Open Babel/RDKit/Vina/PLIP/fpocket/FreeSASA/Mol* MCP adapters are implemented. Public deployment hardening and full browser/E2E rehearsal remain incomplete.

## Phase 0 — Foundation

- [x] Initialize npm workspaces for `apps/*` and `packages/*`.
- [x] Add root Node/npm engine requirements and lockfile.
- [x] Configure strict shared TypeScript.
- [x] Configure TypeScript project references and workspace path aliases.
- [x] Configure ESLint and Prettier.
- [x] Scaffold React/Vite web app.
- [x] Configure Tailwind CSS and shadcn/ui.
- [x] Scaffold Fastify API with Zod environment validation and Pino-backed logging, without routes.
- [x] Scaffold one NitroStack `apps/mcp` server with modular MCP capability groups.
- [x] Scaffold Prisma/SQLite package without database models.
- [x] Add root build/typecheck/lint/test scripts.
- [x] Add `.env.example` and startup environment validation.
- [x] Add `/health/live` and web health indicator.

## Phase 1 — Domain and algorithms

- [x] Define shared IDs, enums-as-Zod schemas, and error schemas.
- [x] Define run configuration and immutable snapshot schema.
- [x] Implement canonical JSON and SHA-256 helpers.
- [x] Implement FASTA parser and strict protein validation.
- [ ] Implement coordinate conversion helpers.
- [x] Implement MHC-I peptide generation.
- [x] Implement MHC-II peptide generation.
- [x] Implement candidate-key generation.
- [x] Implement registered normalization functions.
- [ ] Implement evidence grouping compatibility checks.
- [x] Implement weighted mean, variance, agreement, completeness, consensus.
- [ ] Implement categorical entropy for display.
- [x] Implement exact duplicate detection.
- [x] Implement interval overlap and deterministic dominance.
- [x] Implement rule engine and initial rule catalog.
- [x] Implement MHC-I/MHC-II ranking profile.
- [x] Implement B-cell ranking profile.
- [x] Implement category/confidence labels and stable sort.
- [x] Implement deterministic candidate explanation.
- [ ] Reach 90% coverage for algorithms.

## Phase 2 — Data and database

Data-policy note: source-backed public facts and schema-compatible synthetic values must remain
distinguishable. Restricted, license-unclear, or sensitive values use explicit `SYNTHETIC` and
`scientificUse: false` provenance and are not research evidence.

- [x] Create reference-data schemas and manifest validation.
- [x] Add amino-acid reference.
- [x] Add draft HLA connector-support registry.
- [x] Add versioned normalization/rule/ranking profiles.
- [x] Add five manifest-verified synthetic demo proteins; three have full replay fixtures.
- [x] Implement Prisma models and first migration.
- [x] Persist singleton/set population coverage and shortlist-optimization steps.
- [x] Enable SQLite foreign keys and WAL.
- [x] Implement repositories and transaction service.
- [x] Implement append-only evidence/event protections.
- [x] Implement artifact-root path containment.
- [x] Add migration and repository integration tests.

## Phase 3 — Hybrid resolver and fixtures

Fixture-policy note: demo proteins, predictor-shaped outputs, coverage values, and expected rankings
are synthetic. They must remain `FIXTURE`, match exact approved inputs/configuration, never enter the
live cache, and never be presented as provider-produced, experimental, clinical, or research data.

- [x] Define connector descriptor, result, health, and error contracts.
- [x] Implement deterministic cache-key builder.
- [x] Implement live-result cache repository.
- [x] Implement fixture manifest and exact matcher.
- [x] Curate synthetic COVID-like UI fixture (not SARS-CoV-2 reference data).
- [x] Curate synthetic influenza-like UI fixture (not influenza reference data).
- [x] Curate synthetic dengue-like UI fixture (not dengue reference data).
- [x] Add reviewer and source notes to fixtures.
- [x] Implement fallback policy resolver.
- [x] Implement GraphBepi as an exact-match fixture-only adapter with no live/cache execution path.
- [x] Reject GraphBepi configurations whose fallback policy does not permit fixtures.
- [x] Test timeout, rate-limit, network, mismatch, and corrupt-output cases.
- [x] Verify all fixture replay hashes.

## Phase 4 — MCP

- [x] Implement Immunoinformatics tool contracts in `immunograph-mcp`; connector execution remains behind capability ports.
- [x] Implement Evidence tool contracts in `immunograph-mcp`; external coverage execution remains behind a capability port.
- [x] Implement Constraint tools in `immunograph-mcp` using shared deterministic algorithms.
- [x] Implement Report tool contracts in `immunograph-mcp`; artifact I/O remains behind a capability port.
- [x] Implement Structure tools: RCSB/AlphaFold fetch, validate, epitope mapping, FreeSASA accessibility, confidence, fpocket pockets, and Mol* view-state.
- [x] Implement Chemistry tools: PubChem fetch, validate, deduplicate, RDKit descriptors, and Open Babel ligand preparation.
- [x] Implement Docking tools: Open Babel receptor preparation, docking-box validation, AutoDock Vina execution, pose clustering, PLIP interaction extraction, and Mol* view-state.
- [x] Register all seven capability modules in one NitroStack server process.
- [x] Add common tool envelopes, deterministic hashes, structured logging, and error mapping.
- [x] Add task progress/cancellation checks to tool execution, including long prediction tools.
- [x] Embed schema-validated example calls for every tool for NitroStudio discovery.
- [x] Expose the internal agent/orchestrator model through the read-only `describe_agentic_workflow` MCP tool.
- [x] Implement bounded LangGraph workflow execution through `run_agentic_workflow`.
- [x] Implement grounded researcher chat contract through `chat_with_research_agent`.
- [x] Implement MCP research-package export contract through `export_research_package`.
- [x] Add MCP discovery, schema, deterministic execution, fallback, and logging contract tests.

## Phase 5 — Workflow and API

- [x] Replace the default inline fixture port with the MCP-first `ScientificWorkflowService`.
- [x] Connect Fastify to the separately running NitroStack server over Streamable HTTP.
- [x] Persist requested and resolved execution modes and synthetic provenance.
- [x] Implement policy-controlled `LIVE/CACHED -> SYNTHETIC -> exact FIXTURE` resolution.
- [x] Retain local exact-fixture replay only as the emergency final fallback.
- [x] Implement run and stage state machines.
- [x] Define immutable workflow DAG.
- [ ] Implement dependency readiness scheduler.
- [ ] Implement bounded parallel stage execution.
- [ ] Implement cancellation and retry.
- [x] Persist `FIXTURE_ONLY` quality for exact synthetic replay runs.
- [x] Implement configuration approval lifecycle mutation and persisted event.
- [x] Implement configuration approval REST validation and shared-service delegation.
- [x] Implement shortlist approval lifecycle mutation and persisted event.
- [x] Implement shortlist approval REST validation and shared-service delegation.
- [x] Implement project/run REST endpoints and idempotent command boundary.
- [x] Compose the concrete REST application-service layer over repositories and capability ports.
- [x] Implement candidate/evidence and visualization endpoints.
- [x] Implement population-coverage and shortlist-optimization endpoints.
- [x] Implement connector and safe-runtime diagnostics endpoints.
- [x] Extend project lists with server-owned portfolio summary contracts.
- [x] Validate candidate search and warning-presence query filters.
- [x] Snapshot output preferences in run/report request contracts.
- [x] Expose safe fixture-manifest and application-build diagnostic contracts.
- [x] Implement persisted, resumable SSE event replay and paginated history endpoint.
- [x] Implement report, artifact-list, and safe artifact-download endpoints.
- [x] Implement API delegation endpoints for `POST /runs/:runId/agent-workflow` and `POST /runs/:runId/chat`.
- [x] Add REST integration tests, error envelopes, structured logging, and Zod validation.
- [x] Add database-backed API application-service integration tests.

## Phase 6 — Live connectors

- [ ] Confirm licenses and supported programmatic access.
- [x] Implement IEDB MHC-I adapter.
- [x] Implement IEDB MHC-II adapter.
- [x] Implement optional configurable IEDB HTTP population-coverage adapter.
- [x] Implement optional local MHCflurry MHC-I adapter behind `MHCFLURRY_ENABLED`.
- [x] Add connector registry, HLA support, normalization profile, and manifest updates for `mhcflurry-presentation`.
- [x] Route mixed IEDB + MHCflurry MHC-I method requests through separate connectors and merge provenance.
- [x] Add repeatable `npm run connectors:install:mhcflurry` and `npm run connectors:check:mhcflurry` commands.
- [x] Install and verify MHCflurry CLI/models in the local development runtime.
- [ ] Install and verify MHCflurry CLI/models in the production deployment runtime before enabling `MHCFLURRY_ENABLED=true` there.
- [x] Add official IEDB standalone population-coverage connector behind `IEDB_POPULATION_COVERAGE_ENABLED`.
- [x] Add repeatable `npm run connectors:install:iedb-population` and `npm run connectors:check:iedb-population` commands.
- [ ] Verify IEDB population coverage package installation in the production deployment runtime.
- [ ] Register score profiles for each enabled method/version.
- [x] Add parser samples and tests.
- [x] Verify `LIVE -> CACHED` behavior.
- [x] Verify each fallback reason and status display.
- [x] Implement production live structure retrieval adapters for RCSB PDB and AlphaFold DB.
- [x] Implement production live chemistry adapters for PubChem, Open Babel, and RDKit.
- [x] Implement production live docking adapters for AutoDock Vina, PLIP, fpocket, FreeSASA, and Mol* view-state.
- [ ] Verify Docker image build with NitroStack Cloud runtime once Docker Desktop or cloud builder is available.

## Phase 7 — UI

- [x] Build application shell and navigation.
- [x] Build project/FASTA upload flow.
- [x] Build analysis configuration form.
- [x] Build configuration approval screen.
- [x] Build run overview and connector-status matrix.
- [x] Build React Flow workflow graph.
- [x] Build track-specific candidate tables.
- [x] Build candidate evidence detail.
- [x] Build sequence map.
- [x] Build Recharts population coverage view.
- [ ] Build Recharts constraint/score views.
- [x] Build React Flow evidence graph.
- [x] Build compare candidates view.
- [x] Build shortlist approval flow.
- [x] Build report/artifact downloads.
- [x] Build connector/settings diagnostics.
- [ ] Test keyboard, focus, responsive, empty, partial, and failure states.

## Phase 8 — Reports and explanations

- [x] Generate JSON/CSV report contents through the NitroStack `generate_report` tool.
- [x] Display and export the mandatory synthetic demonstration disclaimer.
- [x] Implement local JSON synthetic-fixture report export.
- [x] Implement local CSV synthetic-fixture candidate export.
- [x] Implement workflow/evidence graph exports.
- [x] Implement mandatory `research-package.zip` export with manifest, JSON/MD/CSV files, approvals, evidence graph, workflow trace, limitations, fixture docking PDBQT/JSON/PNG artifacts, and checksums.
- [x] Embed fixture provenance, quality, and synthetic-data disclaimer in local report exports.
- [ ] Implement deterministic report narrative.
- [ ] Implement optional LLM provider interface.
- [ ] Implement grounded-output validation.
- [ ] Verify deterministic fallback on LLM failure.

## Phase 9 — Final verification

- [x] Run full test suite.
- [ ] Run coverage suite.
- [x] Run clean database migration.
- [x] Run offline fixture demos.
- [ ] Run live/cached path where available.
- [ ] Demonstrate timeout-to-fixture fallback.
- [ ] Demonstrate failed/partial branch.
- [ ] Demonstrate disagreement-to-review outcome.
- [ ] Verify replay hashes.
- [ ] Run security/dependency checks.
- [ ] Review logs for sequence/secret leakage.
- [ ] Rehearse demo using the final build.
- [ ] Freeze demo data and profile versions.

## Definition of done

A task is done only when implementation, tests, documentation, error handling, and observability are complete. A manually successful screen or NitroStudio call alone is not sufficient.
