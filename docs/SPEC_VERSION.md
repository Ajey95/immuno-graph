# Specification Version

## Current specification

| Field | Value |
|---|---|
| Specification ID | `immunograph-spec` |
| Version | `0.8.0` |
| Status | `APPROVED — FROZEN MVP IMPLEMENTATION BASELINE` |
| Released | 2026-07-24 |
| Product scope | Epitope prioritization MVP |
| Implementation gate | Open |

This file versions the documentation set, not an application build or scientific predictor.

## Meaning of the current status

`0.8.0` incorporates the MCP-first, policy-controlled execution model accepted in ADR-022. It freezes the offline synthetic demonstration boundary, separate requested and resolved execution modes, explicit non-scientific provenance, fixture-last fallback, GraphBepi fixture-only behavior, and the exclusion of conservation and toxicity from the MVP.

No implementation should silently choose between conflicting contracts. Record and resolve the conflict in the specifications first.

## Specification set

### Scope and product intent

- `README.md`
- `PROJECT_SPEC.md`
- `LIMITATIONS.md`
- `DECISIONS.md`

### Canonical domain semantics

- `DOMAIN_MODEL.md`
- `SPEC_VERSION.md`

### Architecture and behavior

- `ARCHITECTURE.md`
- `AGENT_SPEC.md`
- `ALGORITHM_SPEC.md`
- `MCP_SPEC.md`

### External and persistence contracts

- `API_SPEC.md`
- `DATABASE_SCHEMA.md`
- `DATA_SPEC.md`
- `PROMPTS.md`

### Delivery and quality

- `IMPLEMENTATION_PLAN.md`
- `TASKS.md`
- `CODING_GUIDELINES.md`
- `TEST_PLAN.md`
- `UI_UX_SPEC.md`
- `OBSERVABILITY.md`
- `SECURITY.md`

### Supporting contributor guidance

- `CONTRIBUTING.md`

## Authority by concern

The specification uses concern-based authority rather than allowing one document to override all others.

| Concern | Authoritative document(s) |
|---|---|
| Product scope, goals, non-goals | `PROJECT_SPEC.md`, `LIMITATIONS.md`, accepted ADRs |
| Accepted architectural choices | `DECISIONS.md` |
| Domain terms, enums, identities, invariants | `DOMAIN_MODEL.md` |
| Components, packages, dependency direction | `ARCHITECTURE.md` |
| Deterministic formulas and scientific stage behavior | `ALGORITHM_SPEC.md` |
| MCP interfaces | `MCP_SPEC.md` |
| REST interfaces | `API_SPEC.md` |
| Persistence | `DATABASE_SCHEMA.md` |
| Reference data, fixtures, cache format | `DATA_SPEC.md` |
| Agent permissions | `AGENT_SPEC.md` |
| LLM behavior | `PROMPTS.md` |
| Security controls | `SECURITY.md` |

If two authoritative documents disagree across concerns, implementation stops until both are updated. `SPEC_VERSION.md` records the resulting version change.

## Changes in 0.8.0

- Fastify now invokes the separately running NitroStack MCP server over Streamable HTTP.
- Requested execution mode and resolved execution mode are distinct contracts.
- The deterministic synthetic binding and population-coverage tools are explicit demonstration-only capabilities.
- Synthetic provenance is persisted and displayed with `scientificUse=false` and `DEMONSTRATION_ONLY`.
- Exact fixture replay remains the final emergency fallback; GraphBepi remains fixture-only.
- Conservation and toxicity remain outside the frozen MVP.

## Changes in 0.3.0-draft

The MVP baseline now defines:

- one `immunograph-mcp` NitroStack server process;
- Prediction, Evidence, Constraint, and Report as internal capability modules;
- GraphBepi as exact-match fixture-only, with no live or cached execution path;
- no conservation configuration, algorithm, rule, score, persistence field, API field, or UI surface in the MVP;
- T-cell ranking components of binding, consensus, singleton population coverage, and completeness;
- coverage-aware shortlist optimization after individual ranking;
- a fixture-only B-cell profile using GraphBepi score and completeness.

The domain baseline introduced in `0.2.0-draft` defines:

Added `DOMAIN_MODEL.md` and `SPEC_VERSION.md`.

The domain baseline now explicitly defines:

- run status separately from run quality;
- deterministic decision category separately from researcher disposition;
- connector execution failure separately from scientific observations;
- complete immutable profile snapshots;
- full candidate positional identity;
- preliminary and final scoring phases;
- a non-circular overlap-resolution sequence;
- set-level population coverage and coverage-aware shortlist optimization;
- `AgentDecision` and `IdempotencyRecord`;
- B-cell region harmonization requirements;
- evidence-graph node and edge vocabularies;
- required snapshot and replay hashes.

## Alignment checklist for 0.3.0

The following documentation work is required before changing the status to `IMPLEMENTATION_READY`:

- [ ] Update `PROJECT_SPEC.md` so `PARTIAL` is only run quality, not a terminal status.
- [ ] Update `PROJECT_SPEC.md` to separate project creation from draft-run creation or explicitly combine the API command.
- [x] Update `ARCHITECTURE.md` with the two-pass scoring/constraint workflow.
- [ ] Choose and document the exact API-to-MCP transport and database ownership model.
- [x] Update `ALGORITHM_SPEC.md` to remove circular individual `populationContribution` ranking.
- [x] Update `ALGORITHM_SPEC.md` duplicate detection to preserve identical peptides at different coordinates.
- [x] Restrict the MVP B-cell path to fixture-only GraphBepi and prohibit cross-predictor consensus claims.
- [x] Update `MCP_SPEC.md` with preliminary/final scoring and shortlist-optimization contracts.
- [ ] Update `API_SPEC.md` with artifact ingestion, idempotency, shortlist optimization, and unified error mapping.
- [ ] Update `DATABASE_SCHEMA.md` with the persistence additions listed in `DOMAIN_MODEL.md`.
- [x] Disable threshold/weight customization for MVP v1.0; changes require a new immutable versioned profile file.
- [x] Approve exact `mvp-v1.0` weights for T-cell binding/consensus/coverage/completeness and B-cell GraphBepi-score/completeness.
- [ ] Define hard capacity limits for alleles, methods, candidates, graphs, and concurrent connector calls.
- [ ] Add the diagnostics metrics endpoint to `API_SPEC.md`.
- [ ] Update `TEST_PLAN.md` with domain-model conformance and two-pass ranking tests.
- [ ] Re-run a full cross-document terminology and link audit.

## Version policy

The specification uses semantic versioning while pre-1.0:

### Major

Increment the major version for a fundamental product change, such as moving beyond epitope prioritization, adding clinical use, or changing the scientific decision-support boundary.

### Minor

Increment the minor version for a backward-incompatible or material contract change during the draft phase, including:

- new or changed domain entities;
- altered formulas, rules, thresholds, or ranking semantics;
- new MCP/API/database contracts;
- new required workflow stages;
- expanded scientific scope.

### Patch

Increment the patch version for backward-compatible clarification, corrected examples, typo fixes, and added tests that do not change semantics.

Scientific method, profile, fixture, prompt, API, and application versions remain independently versioned inside their own contracts.

## Status lifecycle

```text
DRAFT — ALIGNMENT REQUIRED
  -> REVIEW CANDIDATE
  -> IMPLEMENTATION_READY
  -> IMPLEMENTED
  -> VERIFIED
  -> SUPERSEDED
```

Definitions:

- `DRAFT — ALIGNMENT REQUIRED`: known cross-document conflicts remain.
- `REVIEW CANDIDATE`: documents are aligned and awaiting product/domain/engineering review.
- `IMPLEMENTATION_READY`: scope and implementation contracts are internally consistent; open external connector approvals are explicitly gated.
- `IMPLEMENTED`: the version's required implementation tasks are complete.
- `VERIFIED`: acceptance, security, replay, and demo evidence pass.
- `SUPERSEDED`: a newer specification version controls new work.

## Change procedure

1. Identify the authoritative document for the concern.
2. Record a new ADR when an accepted architectural decision changes.
3. Update all dependent documents in the same change set.
4. Add or update acceptance tests and fixture expectations when semantics change.
5. Increment this specification version.
6. Add a changelog entry.
7. Run link, terminology, schema, and cross-contract audits.
8. Obtain the required reviewers.

## Review requirements

| Change | Required review |
|---|---|
| Product scope or disclaimer | Product owner and domain reviewer |
| Scientific formula/rule/profile | Domain reviewer and algorithm owner |
| Predictor connector or fixture | Connector owner, domain reviewer, and license check |
| Domain/API/MCP/database contract | Lead engineer |
| Security boundary | Security reviewer or documented lead-engineer review |
| Prompt behavior | Lead engineer and domain reviewer |

## Changelog

### 0.7.0-draft — 2026-07-24

- Defined the strict candidate comparison response used by the approved comparison workspace.
- Added an aligned component and constraint map so the frontend can compare two to five candidates without deriving scientific values.

### 0.6.1-draft — 2026-07-24

- Clarified that draft creation and run lifecycle mutations return the authoritative run-detail representation.
- Aligned the navigation wireframe with contextual project/run navigation and removed the obsolete global Current Run row.
- Recorded the implemented frontend surfaces without closing unverified browser and responsive tasks.

### 0.6.0-draft — 2026-07-24

- Made Dashboard the project-portfolio home and project/run navigation contextual.
- Separated project analysis Settings from read-only System Diagnostics.
- Added server portfolio summaries, candidate search/warning filters, immutable output preferences, and safe fixture/build diagnostics to the REST contract.

### 0.5.0-draft — 2026-07-24

- Defined full positional candidate identity for duplicate detection.
- Required identical peptide sequences at different coordinates to remain distinct.
- Added ADR-020 and aligned deterministic duplicate tests.

### 0.4.0-draft — 2026-07-24

- Adopted file-backed immutable profiles under `data/profiles/` and prohibited profile-definition tables.
- Required run snapshots to persist only profile name, version, and SHA-256 hash metadata.
- Froze the approved MVP v1.0 T-cell and B-cell ranking weights and disabled in-place customization.
- Added ADR-019 and superseded ADR-011.

### 0.3.0-draft — 2026-07-24

- Consolidated the proposed MCP servers into one NitroStack MCP app with internal capability groups and a unified tool catalog.
- Restricted GraphBepi to exact-match fixtures for the MVP.
- Deferred conservation and all dependent contracts to Product Phase 2 (post-MVP).
- Replaced the conservation component with completeness, left exact weights pending explicit approval, and clarified singleton versus shortlist population coverage.
- Added ADR-016, ADR-017, and ADR-018; superseded ADR-004.

### 0.2.0-draft — 2026-07-24

- Added canonical domain model.
- Added specification versioning and concern-based authority.
- Defined terminology required to resolve the initial specification audit.
- Recorded the remaining alignment work before implementation.

### 0.1.0-draft — 2026-07-23

- Created the initial product, architecture, algorithm, MCP, API, data, database, UI, testing, observability, security, prompt, decision, task, and contribution specifications.
