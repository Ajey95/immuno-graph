# Implementation Plan

## 1. Delivery strategy

Build vertical confidence in this order:

```text
schemas -> pure algorithms -> persistence -> fixture execution -> MCP contracts ->
workflow supervisor -> live connectors -> UI -> export -> hardening
```

Do not begin with the dashboard or live APIs. A live connector cannot be trusted until its parsed output passes the same contract used by fixtures and algorithms.

## 2. Phase rules

Each phase must finish with:

1. working code with no placeholder success paths;
2. unit or integration tests for new behavior;
3. updated documentation when a contract changes;
4. `npm run typecheck`, `npm run lint`, and relevant tests passing;
5. an explicit acceptance-criteria review.

A later phase may start only when required predecessor criteria pass.

## Phase 0 — Repository foundation

### Deliverables

- npm-workspace monorepo with `apps/*` and `packages/*`.
- Shared strict TypeScript, ESLint, and Prettier configuration.
- React/Vite/Tailwind/shadcn/ui web shell.
- Fastify API shell with Zod type provider and Pino request logging.
- One NitroStack `apps/mcp` server skeleton with Prediction, Evidence, Constraint, and Report modules.
- Prisma/SQLite package skeleton.
- Root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:coverage`, `db:migrate`, `db:seed`.
- `.env.example` without secrets.

### Acceptance criteria

- `npm install` succeeds from the root.
- `npm run build` builds all workspaces in dependency order.
- API exposes runtime and connector diagnostics for the web shell plus a lightweight `/health/live` process probe.
- Web app renders API-backed runtime and connector states.
- The single MCP server starts, exposes one identity in NitroStudio, and lists the current capability groups even before every scientific runtime is available locally.
- No package imports a forbidden dependency direction from [ARCHITECTURE.md](ARCHITECTURE.md).

## Phase 1 — Domain contracts and deterministic core

### Deliverables

- Shared Zod schemas for sequence, run configuration, candidate, observation, provenance, constraints, ranking, and errors.
- FASTA parser/validator.
- Candidate key and canonical JSON/hash helpers.
- MHC-I/MHC-II peptide generation.
- Normalization registry and transformations.
- Consensus, agreement, completeness, and entropy.
- Duplicate and interval-overlap algorithms.
- Constraint engine and track-specific ranking.
- Deterministic explanation builder.

### Acceptance criteria

- Algorithm tests cover boundary lengths, invalid residues, coordinate conversion, score direction, variance bounds, duplicates, overlap ties, missing evidence, stable sorting, and replay hashing.
- `packages/algorithms` has at least 90% statement and branch coverage.
- No algorithm package performs I/O, logging, network access, database access, or LLM calls.
- Golden unit vectors document expected numeric results to at least six decimal places.

## Phase 2 — Data and persistence

### Deliverables

- Prisma schema and first migration.
- SQLite startup configuration: foreign keys and WAL.
- Repositories for projects, runs, stages, events, candidates, evidence, approvals, artifacts, graphs, and cache.
- Transactional workflow state transition service.
- Reference-data manifest loader with hash verification.
- Artifact-root service with path containment checks.

### Acceptance criteria

- Repository integration tests run against a temporary SQLite file.
- Append-only repositories reject updates through public interfaces.
- State transition and event insert are atomic.
- Cache refuses fixture-derived values.
- A completed run configuration cannot be edited.
- Migration-up test passes from an empty database.

## Phase 3 — Fixtures and connector resolver

### Deliverables

- Fixture schema and manifest validator.
- Three approved demo cases: COVID spike, influenza, dengue.
- Connector interface and registry.
- Cache adapter.
- Hybrid resolver implementing configured policy.
- Mock live connectors for deterministic failure-path tests.
- Connector health model.
- Fixture-only GraphBepi adapter with no live/cache code path.

### Acceptance criteria

- Exact fixture matches succeed; one-parameter or one-hash mismatch fails.
- Eligible failures fall back only when policy permits.
- Invalid live output does not enter cache.
- `LIVE`, `CACHED`, `FIXTURE`, and `FAILED` are preserved through persistence and serialization.
- Each fixture reproduces its expected candidate counts and ranking hash.
- GraphBepi returns only `FIXTURE` or `FAILED` and never enters the live-result cache.

## Phase 4 — Single MCP server

### Deliverables

- All tools/resources/prompts from [MCP_SPEC.md](MCP_SPEC.md).
- Zod schemas at every tool boundary.
- Task progress and cancellation for long-running predictions where supported.
- Stable tool error mapper.
- NitroStudio example inputs.
- MCP contract test suite.
- One deployable/startable `immunograph-mcp` process containing the full MCP capability catalog: prediction, evidence, constraints, reports, governance, structure, chemistry, docking, and agent orchestration.

### Acceptance criteria

- All tools work with positive examples and reject negative examples.
- No MCP tool returns raw, unparsed provider data as its public output.
- Prediction tools show source status and provenance.
- Constraint/ranking calls are deterministic and idempotent.
- Report tools complete without an LLM.
- Contract tests verify module registration and tool-level allowlists within the single server.

## Phase 5 — Workflow supervisor and REST API

### Deliverables

- Deterministic DAG definition and readiness scheduler.
- Run/stage state machines.
- Parallel prediction branch execution with bounded concurrency.
- Cancellation, retry, partial-run quality, and approval pauses.
- REST endpoints and SSE stream from [API_SPEC.md](API_SPEC.md).
- Idempotency support for start/report commands.

### Acceptance criteria

- A fixture-only run proceeds from project creation to shortlist approval.
- Configuration and ranking snapshot conflicts return 409.
- One failed branch cannot overwrite successful branch data.
- All-predictor failure stops before ranking.
- SSE reconnect using `Last-Event-ID` does not lose ordered events.
- Cancellation reaches connector abort signals.

## Phase 6 — Live scientific connectors

Implement one connector at a time; each is disabled by default until its checklist passes.

### Order

1. IEDB MHC-I supported API.
2. IEDB MHC-II supported API.
3. Population coverage supported service/tool route.
4. Optional local MHCflurry MHC-I adapter, enabled only after the CLI and models are installed.

GraphBepi is intentionally absent from this live-connector phase. Its MVP implementation is the fixture-only adapter delivered in Phase 3.

Current implementation note: IEDB MHC-I/MHC-II adapter code, local MHCflurry MHC-I adapter code, official IEDB standalone population-coverage adapter code, parser tests, mixed-method hybrid fallback routing, and API-owned `LIVE -> CACHED` reuse are present.

### Per-connector deliverables

- capability descriptor;
- method/allele/length validation;
- request builder or process invocation;
- parser with captured redacted samples;
- timeout, retry, cancellation, and health behavior;
- normalization registry entry;
- license/source note;
- contract and parser tests.

### Acceptance criteria

- Connector outputs preserve raw values and units.
- Method/version/parameters are recorded.
- Live success is cached and exact repeat returns `CACHED`.
- Timeout/429/unavailability behavior matches policy.
- No connector uses unsupported screen scraping.

## Phase 7 — Researcher UI

### Deliverables

- Project creation and FASTA validation.
- Configuration review and approval.
- Live workflow graph with connector status badges.
- Candidate table with track tabs and filters.
- Candidate evidence drawer/detail page.
- Sequence map and population/constraint charts.
- React Flow evidence graph.
- Shortlist approval and export UI.
- Settings/connector health view.

### Acceptance criteria

- All primary actions are keyboard accessible.
- Status is never communicated by color alone.
- Fixture provenance is visible on overview, candidate detail, and export confirmation.
- Raw and normalized scores are distinguishable.
- MHC-I, MHC-II, and B-cell rankings are not merged.
- Empty, loading, partial, failed, and cancelled states are designed and tested.

## Phase 8 — Reports and grounded explanation

### Deliverables

- JSON run export.
- Candidate and rejected-candidate CSV exports.
- Evidence graph and workflow trace exports.
- Deterministic report narrative.
- Optional LLM adapter using prompts from [PROMPTS.md](PROMPTS.md).
- Post-generation grounding validator.

### Acceptance criteria

- Export blocked before shortlist approval.
- Every export contains run quality, provenance, profiles, and disclaimer.
- LLM-disabled run exports successfully.
- Altered/hallucinated numeric values cause the LLM version to be discarded.
- Artifact hashes and size are persisted.

## Phase 9 — Verification and demo hardening

### Deliverables

- Full unit, integration, MCP contract, API, UI, and end-to-end suites.
- Golden regression suite for all three fixtures.
- Failure demonstrations: timeout fallback, partial branch, insufficient evidence.
- Performance measurements.
- Security checks and dependency audit.
- Final demo rehearsal.

### Acceptance criteria

- All root quality commands pass from a clean checkout.
- Offline fixture demo completes within 60 seconds.
- Repeating each fixture produces the same replay hash.
- At least one scenario visibly abstains or routes to review.
- Logs/traces demonstrate the full source-status lineage.
- No critical/high known dependency vulnerability remains without written risk acceptance.

## 3. Recommended team split

| Workstream | Scope |
|---|---|
| Deterministic core | Domain schemas, algorithms, rules, ranking, tests |
| Scientific/MCP | Connectors, hybrid resolver, one NitroStack MCP app with internal capability/tool groups |
| Platform | Fastify, workflow supervisor, Prisma, SSE, observability |
| Experience | React UI, visualizations, approval, exports, demo |

Shared contracts are reviewed before parallel implementation.

## 4. Change control

Any change to scientific semantics requires:

1. an update to `ALGORITHM_SPEC.md` or `DATA_SPEC.md`;
2. a new profile version;
3. updated golden expectations;
4. a migration only if persisted shape changes;
5. an ADR when the architecture boundary changes.
