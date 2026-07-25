# REST API Specification

## 1. General contract

Base path: `/api/v1`  
Content type: `application/json; charset=utf-8`  
Validation: Zod at the Fastify route boundary  
IDs: UUID strings  
Dates: UTC ISO 8601  
Authentication: none in MVP; server binds to loopback by default

All responses include:

```json
{
  "requestId": "uuid",
  "data": {}
}
```

Errors use:

```json
{
  "requestId": "uuid",
  "error": {
    "code": "INVALID_FASTA",
    "message": "The upload must contain exactly one protein FASTA record.",
    "retryable": false,
    "fieldErrors": { "fasta": ["Multiple records found"] }
  }
}
```

## 2. Project endpoints

### `POST /projects`

Creates a project and validates/stores one protein input.

```json
{
  "name": "Dengue envelope shortlist",
  "organism": "Dengue virus",
  "proteinName": "Envelope protein",
  "description": "Hackathon demonstration",
  "fasta": ">dengue-envelope\nMRCIGISNRD..."
}
```

Returns `201` with project and protein metadata; never echoes the full sequence by default.

### `GET /projects`

Returns project summaries ordered by `updatedAt` descending. Query: `limit` default 20/max 100, `cursor`.

The response includes server-computed workspace totals. These values cover the complete workspace, not only the returned cursor page. The service selects the recent-activity window and returns `recentSince` so clients can label it accurately.

```json
{
  "items": [],
  "nextCursor": null,
  "portfolioSummary": {
    "projectCount": 3,
    "runCounts": { "total": 8, "running": 1, "completed": 6, "failed": 1 },
    "candidateCount": 412,
    "reportCount": 5,
    "recentSince": "2026-06-24T00:00:00.000Z",
    "recentRunCount": 4,
    "asOf": "2026-07-24T12:00:00.000Z"
  }
}
```

### `GET /projects/:projectId`

Returns project, input metadata, run summaries, and latest approval state.

### `DELETE /projects/:projectId`

Requires body `{ "confirmation": "DELETE", "expectedProjectName": "..." }`. Deletes database records and project artifacts in a controlled transaction/workflow. This is the only material delete endpoint.

## 3. Run configuration endpoints

### `POST /projects/:projectId/runs`

Creates a draft run revision.

```json
{
  "analysis": {
    "mhci": { "enabled": true, "alleles": ["HLA-A*02:01"], "peptideLengths": [9, 10], "methods": ["iedb-recommended"] },
    "mhcii": { "enabled": true, "alleles": ["HLA-DRB1*04:01"], "peptideLengths": [15], "methods": ["iedb-recommended"] },
    "bcell": { "enabled": true, "methods": ["graphbepi"] }
  },
  "populations": ["INDIA"],
  "fallbackPolicy": "CACHE_THEN_LIVE_THEN_FIXTURE",
  "requestedExecutionMode": "AUTO",
  "ruleProfileVersion": "mvp-v1.0",
  "rankingProfileVersion": "mvp-v1.0",
  "outputPreferences": {
    "formats": ["JSON", "CSV"],
    "templateVersion": "research-report-v1",
    "includeWorkflowTrace": true,
    "includeEvidenceGraph": true
  }
}
```

The server normalizes unordered arrays, validates connector compatibility, and returns a configuration hash. In the MVP, `graphbepi` is fixture-only; selecting it with a policy that does not permit fixtures returns `GRAPHBEPI_REQUIRES_FIXTURE_POLICY`. Conservation and alignment fields are rejected as unknown MVP configuration fields.

Successful draft creation and run lifecycle mutations return the complete run-detail representation documented for `GET /runs/:runId`. This includes the authoritative status and snapshot hash after the transition; clients must not synthesize either value.

### `GET /runs/:runId`

Returns lifecycle, quality, resolved `executionMode`, configuration summary (including requested execution mode), stage progress, connector status, and approval requirements.

### `POST /runs/:runId/approvals/configuration`

```json
{
  "decision": "APPROVE",
  "expectedConfigurationHash": "sha256",
  "note": "Configuration reviewed"
}
```

On approval, transitions the run to `QUEUED`. Stale hashes return `409 CONFIGURATION_CHANGED`.

### `POST /runs/:runId/start`

Idempotently starts an approved queued run. Returns `202`.

### `POST /runs/:runId/cancel`

Requests cooperative cancellation. Terminal runs return `409 RUN_ALREADY_TERMINAL`.

### `POST /runs/:runId/stages/:stageKey/retry`

Allowed only for failed retryable connector stages. Requires `{ "expectedAttempt": 1 }` and creates the next attempt.

## 4. Workflow events

### `GET /runs/:runId/events`

Server-Sent Events stream. Supports `Last-Event-ID`.

```text
id: 42
event: stage.status_changed
data: {"runId":"...","stageKey":"predict_mhci","status":"SUCCEEDED","sourceStatus":"LIVE","at":"..."}
```

Event types:

- `run.status_changed`
- `stage.status_changed`
- `stage.progress`
- `connector.status_changed`
- `approval.required`
- `candidate.summary_ready`
- `artifact.created`
- `run.warning`

Heartbeat comments are sent every 15 seconds. Clients reconnect with exponential backoff.

### `GET /runs/:runId/events/history`

Paginated JSON event history for debugging and replay views.

## 5. Agentic workflow endpoints

These endpoints expose the PRD v1.1 AI-agentic methodology through the Fastify API while keeping
the NitroStack MCP app as the execution boundary. Routes must remain thin adapters and delegate to
shared application services, which call typed MCP tools.

### `POST /runs/:runId/agent-workflow`

Runs the bounded LangGraph agent workflow for a run.

```json
{
  "objective": "Prioritize epitopes with structure, chemistry, and docking governance.",
  "agentMode": "DETERMINISTIC",
  "approvedToolNames": ["validate_sequence", "rank_candidates", "run_docking"],
  "requireHumanApproval": true
}
```

Returns `202`.

Response data includes:

- `runtime: "LANGGRAPH"`;
- `agentMode: "LLM" | "DETERMINISTIC"`;
- `llmUsed`;
- `status: "COMPLETED" | "AWAITING_APPROVAL" | "ABSTAINED"`;
- `nextApprovalGate`;
- bounded workflow `steps`;
- warnings.

If `agentMode="LLM"` but no validated LLM provider is configured, the MCP workflow runs deterministic
routing and returns an explicit warning. LLM text must never become scientific evidence.

### `POST /runs/:runId/chat`

Answers a researcher question using only supplied run/evidence context.

```json
{
  "question": "Why is the top candidate marked for review?",
  "agentMode": "DETERMINISTIC",
  "audience": "RESEARCHER",
  "evidenceSummary": {
    "candidate-1": "High binding agreement, missing live population coverage."
  }
}
```

Returns `200`.

The response must include whether the answer is grounded, cited evidence keys, limitations, requested
agent mode, and whether an LLM was actually used. If evidence is missing, the agent abstains instead
of fabricating.

## 6. Candidate endpoints

### `GET /runs/:runId/candidates`

Query parameters:

- `track=MHCI|MHCII|BCELL`
- `category=RECOMMENDED|REVIEW|REJECTED`
- `sourceStatus=LIVE|CACHED|SYNTHETIC|FIXTURE|FAILED`
- `allele`
- `minScore`, `maxScore`
- `search`: trimmed, case-insensitive candidate ID or peptide substring, maximum 200 characters
- `hasWarnings=true|false`
- `sort=rank|score|start`
- `limit` default 50/max 500
- `cursor`

Returns candidate cards with final score, confidence, rank, top reasons, warnings, and source-status summary.

### `GET /runs/:runId/candidates/:candidateId`

Returns:

- coordinates and sequence;
- raw prediction observations;
- normalized observations and transformation profiles;
- consensus and completeness;
- singleton and shortlist population-coverage evidence;
- all constraint outcomes;
- ranking components;
- graph neighbors;
- deterministic explanation and optional LLM explanation status.

### `POST /runs/:runId/candidates/compare`

Body: `{ "candidateIds": ["uuid", "uuid"] }`, maximum five, same track required. Returns aligned component/rule comparison:

```json
{
  "track": "MHCI",
  "candidates": [
    {
      "id": "uuid",
      "peptide": "YLQPRTFLL",
      "rank": 1,
      "finalScore": 0.91,
      "confidence": "HIGH",
      "category": "RECOMMENDED"
    }
  ],
  "components": [{ "name": "Binding", "values": { "uuid": 0.95 } }],
  "constraints": [
    { "ruleId": "binding-minimum", "label": "Binding minimum", "outcomes": { "uuid": "PASS" } }
  ]
}
```

Candidate IDs are the object keys in aligned `values` and `outcomes` maps. A component value may be `null` only when that component is unavailable for the candidate; clients display it as unavailable rather than zero.

### `GET /runs/:runId/population-coverage`

Query parameters: `populationId`, `purpose=CANDIDATE_RANKING|SHORTLIST_OPTIMIZATION|FINAL_SHORTLIST`, and optional `candidateId`. Returns typed singleton or set-level coverage results with source provenance. Missing evidence is represented as unavailable, never as zero.

### `GET /runs/:runId/shortlist-optimization`

Query parameter: `track=MHCI|MHCII`. Returns the final ranking snapshot reference, deterministic selection steps, marginal gains, cumulative coverage, final set-level coverage, and algorithm version. B-cell requests return `INVALID_COVERAGE_TRACK`.

## 7. Shortlist approval

### `POST /runs/:runId/approvals/shortlist`

```json
{
  "decision": "APPROVE",
  "expectedRankingSnapshotHash": "sha256",
  "approvedCandidateIds": ["uuid", "uuid"],
  "excludedCandidateIds": ["uuid"],
  "note": "Reviewed for export"
}
```

Constraints:

- rejected candidates cannot be approved;
- every approved ID must belong to the snapshot;
- stale snapshot returns `409 RANKING_CHANGED`;
- at least one candidate is required unless the researcher explicitly approves an empty shortlist with `allowEmpty: true` and a note.

## 8. Evidence and graph endpoints

### `GET /runs/:runId/evidence-graph`

Returns React Flow-compatible nodes/edges after server-side validation. Query `candidateId` limits the subgraph; `depth` default 2/max 4.

### `GET /runs/:runId/workflow-graph`

Returns workflow nodes, edges, attempts, durations, and status.

### `GET /runs/:runId/visualizations/:type`

Types: `sequence-map`, `population-coverage`, `constraint-summary`, `score-distribution`, `connector-status`.

Returns a versioned view model. The endpoint never returns an AI-generated scientific image.

## 9. Connector endpoints

### `GET /connectors`

Returns configured connector descriptors without secrets.

### `GET /connectors/health`

Returns:

```json
{
  "connectors": [
    { "id": "iedb-mhci", "health": "AVAILABLE", "checkedAt": "...", "latencyMs": 82 },
    { "id": "graphbepi", "health": "AVAILABLE", "executionModes": ["FIXTURE"], "checkedAt": "...", "reasonCode": "MVP_FIXTURE_ONLY" }
  ]
}
```

Health is operational availability, not scientific validation. GraphBepi is `AVAILABLE` only when its fixture registry is readable and contains at least one approved case; this does not imply live runtime availability.

### `GET /health/live`

Returns `200` with `{ "status": "ok" }` when the Fastify process is responsive. This endpoint does not call application services, the database, MCP, or external scientific connectors.

## 10. Explanation and report endpoints

### `POST /runs/:runId/candidates/:candidateId/explanation`

Body: `{ "mode": "DETERMINISTIC" | "LLM", "audience": "RESEARCHER" | "JUDGE" }`.

LLM mode returns the deterministic explanation if the provider is absent, times out, or fails grounded-output validation. Response includes `generationModeUsed`.

### `POST /runs/:runId/reports`

Requires approved shortlist. Body:

```json
{
  "formats": ["JSON", "CSV"],
  "templateVersion": "research-report-v1",
  "includeWorkflowTrace": true,
  "includeEvidenceGraph": true
}
```

Report options must match the approved run configuration snapshot in MVP v1.0.

Returns `202` with artifact job ID.

### `GET /runs/:runId/artifacts`

Lists artifact metadata.

### `GET /artifacts/:artifactId/download`

Streams an artifact using a server-resolved path. Rejects missing, mismatched, or path-escaping records.

## 11. Settings endpoints

### `GET /settings/profiles`

Returns approved normalization, rule, ranking, fixture, and connector profiles.

### `GET /settings/runtime`

Returns safe runtime information: demo mode, LLM enabled, database status, artifact path availability. Never returns secrets.

```json
{
  "demoMode": true,
  "llmEnabled": false,
  "databaseStatus": "AVAILABLE",
  "artifactPathStatus": "AVAILABLE",
  "fixtureManifest": {
    "version": "mvp-v1.0",
    "sha256": "64-lowercase-hex",
    "entries": [
      {
        "fixtureId": "dengue-envelope",
        "organism": "Dengue virus",
        "proteinName": "Envelope protein",
        "approved": true,
        "sha256": "64-lowercase-hex"
      }
    ]
  },
  "build": {
    "applicationVersion": "0.1.0",
    "specificationVersion": "1.1.0",
    "commitSha": null,
    "builtAt": null
  }
}
```

Status values are `AVAILABLE`, `DEGRADED`, or `UNAVAILABLE`. The response never contains secret values, filesystem paths, full fixture payloads, or FASTA sequences.

## 12. HTTP status mapping

| Status | Use |
|---|---|
| `200` | Successful query/command |
| `201` | Resource created |
| `202` | Asynchronous command accepted |
| `400` | Malformed or semantically invalid request |
| `404` | Resource not found |
| `409` | State/snapshot conflict |
| `413` | FASTA/upload exceeds limit |
| `422` | Schema-valid request fails domain validation |
| `429` | API rate protection triggered |
| `500` | Unexpected internal error |
| `503` | Required local service unavailable |

## 13. Stable error catalog

Initial codes:

```text
INVALID_FASTA
FASTA_MULTIPLE_RECORDS
INVALID_RESIDUE
SEQUENCE_TOO_LONG
SEQUENCE_APPEARS_NUCLEOTIDE
UNSUPPORTED_ALLELE
UNSUPPORTED_METHOD
CONFIGURATION_CHANGED
RUN_NOT_APPROVED
RUN_ALREADY_STARTED
RUN_ALREADY_TERMINAL
STAGE_NOT_RETRYABLE
CONNECTOR_TIMEOUT
CONNECTOR_RATE_LIMITED
CONNECTOR_UNAVAILABLE
STRUCTURE_LIVE_CONNECTOR_UNAVAILABLE
CHEMISTRY_LIVE_CONNECTOR_UNAVAILABLE
DOCKING_RUNTIME_UNAVAILABLE
FIXTURE_NOT_FOUND
FIXTURE_HASH_MISMATCH
NORMALIZATION_PROFILE_MISSING
EVIDENCE_INCOMPATIBLE
CONSTRAINT_SNAPSHOT_REQUIRED
RANKING_CHANGED
CANDIDATE_NOT_APPROVABLE
REPORT_REQUIRES_APPROVAL
ARTIFACT_NOT_FOUND
INTERNAL_ERROR
```

New codes are additive. Existing meanings must not change without an API version change.
