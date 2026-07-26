# Test Plan

## 1. Quality objective

Prove that ImmunoGraph is reproducible, honest about provenance, safe under connector failure, and incapable of bypassing deterministic constraints or approvals.

Vitest is the required test runner. Browser-level tests may add a compatible tool later, but the MVP must not leave core flows dependent on manual testing.

## 2. Test layers

| Layer | Scope | External I/O |
|---|---|---|
| Unit | Domain schemas and pure algorithms | None |
| Parser/adapter | Provider samples to canonical observations | Fixture files only |
| Repository | Prisma/SQLite invariants and transactions | Temporary SQLite |
| MCP contract | Tool schemas, envelopes, errors, tasks | In-process/test client |
| API integration | Fastify routes, state, SSE, artifacts | Temporary SQLite and fake MCP clients |
| UI component | Forms, tables, states, accessibility | Mock API view models |
| End-to-end | Full fixture workflow | Local services, no internet |
| Live smoke | Enabled scientific connectors | Explicit/manual or scheduled; not merge-blocking |
| Golden regression | Fixture ranking/report hashes | No internet |

## 3. Coverage thresholds

- `packages/algorithms`: 90% statements, branches, functions, and lines.
- `packages/shared`: 90%.
- connector parsers: 90% branches for captured formats.
- other backend packages: 80%.
- UI: focus on behavior; 70% overall is a guide, not a substitute for critical-flow tests.

Coverage exclusions require an inline reason and review.

## 4. Unit test matrix

### FASTA validation

- valid multiline sequence;
- CRLF and BOM normalization;
- optional terminal stop marker;
- internal stop marker;
- empty input/header/sequence;
- multiple records;
- lowercase conversion;
- every invalid/ambiguous residue;
- exact maximum length and one over maximum;
- nucleotide-like input;
- stable SHA-256.

### Peptide generation

- sequence shorter/equal/longer than window;
- all configured MHC-I lengths;
- configured MHC-II subset;
- one-based inclusive coordinates;
- no off-by-one at final window;
- stable ordering;
- B-cell rejection.

### Normalization

- identity bounds;
- inverse-percentile cap and direction;
- fixed min/max in both directions;
- logistic midpoint/direction;
- out-of-domain and non-finite rejection;
- unregistered method rejection;
- raw value unchanged.

### Consensus

- equal scores: variance 0, agreement 1;
- maximum disagreement: bounded agreement;
- weighted scores;
- one observation status;
- missing required observations/completeness;
- incompatible evidence groups;
- entropy edge cases;
- deterministic ordering.

### Constraints/ranking

- exact duplicates and canonical tie-break;
- 0%, 80%, and greater-than-80% overlap boundaries;
- separate alleles/tracks do not compete;
- every initial rule pass/warn/fail/not-evaluated;
- hard failure overrides high score;
- optional component weight redistribution;
- missing enabled evidence penalty;
- soft-warning penalty cap;
- fixture status does not alter scientific score;
- category thresholds at exact boundaries;
- stable sorting ties;
- replay hash stability.

## 5. Property and invariant tests

Use generated bounded inputs or table-driven exhaustive cases:

- normalized values always lie in `[0,1]`;
- agreement always lies in `[0,1]`;
- peptide coordinates reproduce the peptide from the source sequence;
- duplicate resolution keeps exactly one canonical candidate per key;
- overlap pruning never crosses track/allele boundaries;
- final score is finite and in `[0,1]`;
- ranking order is stable under input permutation;
- canonical JSON hash is stable under object-key permutation;
- deterministic replay excludes timestamps/IDs.

## 6. Fixture test suite

Required cases:

| Case | Purpose |
|---|---|
| COVID spike | Large sequence and many peptide windows |
| Influenza | Different allele/method mix |
| Dengue | Primary judging demo |

Each case asserts:

- input hash;
- generated peptide hash;
- connector source status;
- raw parsed observation counts;
- normalized samples;
- expected constraint outcomes;
- recommended/review/rejected candidate keys;
- track ranks;
- run quality;
- report/replay hash.

Fixtures are reviewed artifacts. Tests must fail if a fixture changes without an updated manifest hash and expected output.

## 7. Connector resolver tests

Decision table:

| Cache | Live | Fixture | Policy | Expected |
|---|---|---|---|---|
| valid | any | any | cache permitted | `CACHED` |
| miss | success | any | live permitted | `LIVE`, cache write |
| miss | disabled/failed | synthetic allowed | demo mode permitted | `SYNTHETIC`, `scientificUse=false` |
| miss | timeout | exact | fallback permitted | `FIXTURE` |
| miss | 429 | exact | fallback permitted | `FIXTURE` after retry policy |
| miss | unavailable | none | fallback permitted | `FAILED` |
| corrupt | success | any | cache permitted | ignore corrupt cache, then `LIVE` |
| miss | schema-invalid | exact | default | `FAILED`; no silent substitution |
| miss | success | any | `FIXTURE_ONLY` demo | `FIXTURE` if exact |

Also test cancellation, backoff bounds, cache expiry, version invalidation, parameter order normalization, and fixture hash mismatch.

## 8. Live connector contract tests

For each connector:

- captured redacted success response;
- empty result;
- changed/missing columns;
- non-numeric score;
- unsupported allele/length;
- HTTP error mapping;
- timeout and abort;
- provider rate limit;
- method/version provenance;
- raw unit/direction preservation.

Live network smoke tests are opt-in with environment flags. CI merge gates use captured responses, not unstable external services.

## 9. Database tests

- migrations from empty database;
- foreign keys enabled;
- WAL configured;
- atomic state transition/event insert;
- unique run revisions and candidate keys;
- append-only repository behavior;
- completed configuration immutability;
- source-status/cache/fixture invariants;
- rollback on failed artifact/evidence transaction;
- concurrent event sequence allocation;
- artifact path containment;
- project deletion removes only its database/artifact scope.

Every test uses a unique temporary database and artifact directory.

## 10. MCP contract tests

- each input/output schema accepts examples and rejects invalid variants;
- tool error envelopes use stable codes;
- long tasks emit progress and honor cancellation;
- resources resolve known IDs and reject cross-run IDs;
- report prompts receive structured evidence only;
- prediction tools never expose provider secrets/raw unbounded bodies;
- `rank_candidates` rejects missing constraint snapshot;
- `rank_candidates` distinguishes preliminary and final contracts;
- `optimize_shortlist_coverage` runs only after final ranking and rejects B-cell candidates;
- report export rejects unapproved run.
- one NitroStack server identity registers the documented capability groups and tool catalog;
- agent tool allowlists are enforced within the shared server;
- synthetic binding and synthetic population tools always return demonstration-only provenance;
- GraphBepi can return only `FIXTURE` or `FAILED` and has no reachable live/cache path.

## 11. API integration tests

- project creation and validation errors;
- draft run and configuration normalization;
- approval hash conflict;
- start idempotency;
- run-state transition matrix;
- cancel and retry conflicts;
- candidate pagination/filtering;
- same-track comparison requirement;
- shortlist approval validation;
- report approval gate;
- artifact download path safety;
- connector health redaction;
- SSE ordering, reconnect, and heartbeat.

## 12. UI tests

- form validation and server error mapping;
- configuration review summary;
- all connector provenance badges;
- workflow node states and list alternative;
- separate track tabs;
- raw versus normalized score labels;
- high-binding/low-agreement review explanation;
- missing evidence not shown as zero;
- stale approval conflict recovery;
- report button gating;
- keyboard focus, dialog focus return, ARIA labels, and chart table alternatives;
- loading, empty, partial, failed, cancelled, and completed states.

## 13. End-to-end scenarios

### E2E-01 Offline success

Create dengue project, approve config, run exact fixtures, review candidates, approve shortlist, export JSON/CSV, verify hashes.

### E2E-02 Hybrid source mix

Fake live MHC-I success, seeded cache MHC-II, and exact GraphBepi fixture execution. Confirm all three labels across UI and exports and confirm GraphBepi is explicitly labeled **MVP fixture-only**.

### E2E-03 Partial evidence

MHC-I succeeds; MHC-II fails without fixture; verify partial quality, no false zero values, and configured eligibility behavior.

### E2E-04 Scientific abstention

Strong raw binding plus high disagreement/missing required evidence. Verify not recommended and explanation cites exact rules.

### E2E-05 Cancellation

Cancel during live prediction; verify abort, terminal state, retained completed evidence, and no report approval.

### E2E-06 LLM unavailable

Disable LLM; complete export with deterministic explanation.

## 14. Performance targets

- FASTA validation and candidate generation for 10,000 residues: under 1 second on reference development hardware.
- Candidate list API first page: under 300 ms for 50 rows from a 50,000-candidate run after indexing.
- Fixture-only full demo: under 60 seconds.
- SSE event publication after transaction: under 500 ms median.
- UI interaction response: under 100 ms for local filter/control updates.

Measure before optimizing. Record hardware, dataset, and command.

## 15. Security tests

- oversized upload;
- path traversal in filenames/artifact IDs;
- shell metacharacters in connector inputs;
- SSRF attempts against connector configuration;
- malicious FASTA header displayed as text, not HTML;
- prompt injection text in metadata/evidence;
- secret redaction in logs/errors;
- CORS from unapproved origin;
- malformed canonical JSON and hash mismatch;
- vulnerable dependency audit.

## 16. CI quality gate

```text
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test -- --coverage
npm run build
npm run test:fixtures
npm run test:migrations
```

Network-dependent tests are separate and do not make the core build flaky.

## 17. Release evidence

Before the demo/release, archive:

- command output for quality gates;
- fixture replay hashes;
- migration version;
- connector registry/profile versions;
- dependency audit result;
- demo run export;
- known limitations reviewed against [LIMITATIONS.md](LIMITATIONS.md).
