import { z } from 'zod';

export const uuid = z.string().uuid();
export const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const empty = z.object({}).strict();
export const idParams = (name: string) => z.object({ [name]: uuid }).strict();
export const runParams = z.object({ runId: uuid }).strict();
export const candidateParams = z.object({ runId: uuid, candidateId: uuid }).strict();
export const pagination = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(20),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export const projectCreate = z
  .object({
    name: z.string().trim().min(1).max(200),
    organism: z.string().trim().min(1).max(200),
    proteinName: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    fasta: z.string().min(1).max(1_048_576),
  })
  .strict();
export const projectDelete = z
  .object({
    confirmation: z.literal('DELETE'),
    expectedProjectName: z.string().trim().min(1),
  })
  .strict();

const trackConfiguration = z
  .object({
    enabled: z.boolean(),
    alleles: z.array(z.string().min(1)),
    peptideLengths: z.array(z.number().int().positive()),
    methods: z.array(z.string().min(1)),
  })
  .strict();
const bcellConfiguration = z
  .object({
    enabled: z.boolean(),
    methods: z.array(z.string().min(1)),
  })
  .strict();
export const fallbackPolicy = z.enum([
  'LIVE_ONLY',
  'CACHE_THEN_LIVE',
  'CACHE_THEN_LIVE_THEN_FIXTURE',
  'LIVE_THEN_CACHE_THEN_FIXTURE',
  'FIXTURE_ONLY',
]);
export const requestedExecutionMode = z.enum(['AUTO', 'LIVE', 'SYNTHETIC', 'FIXTURE']);
const fixturePolicies = new Set([
  'CACHE_THEN_LIVE_THEN_FIXTURE',
  'LIVE_THEN_CACHE_THEN_FIXTURE',
  'FIXTURE_ONLY',
]);
const reportFormat = z.enum(['JSON', 'CSV']);
export const outputPreferences = z
  .object({
    formats: z.array(reportFormat).min(1),
    templateVersion: z.string().trim().min(1).max(100),
    includeWorkflowTrace: z.boolean(),
    includeEvidenceGraph: z.boolean(),
  })
  .strict()
  .refine((value) => new Set(value.formats).size === value.formats.length, {
    path: ['formats'],
    message: 'formats must be unique',
  });
export const runCreate = z
  .object({
    analysis: z
      .object({
        mhci: trackConfiguration,
        mhcii: trackConfiguration,
        bcell: bcellConfiguration,
      })
      .strict(),
    populations: z.array(z.string().min(1)),
    fallbackPolicy,
    requestedExecutionMode: requestedExecutionMode.default('AUTO'),
    ruleProfileVersion: z.string().min(1),
    rankingProfileVersion: z.string().min(1),
    outputPreferences,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.analysis.bcell.enabled &&
      value.analysis.bcell.methods.some((method) => method.toLowerCase() === 'graphbepi') &&
      !fixturePolicies.has(value.fallbackPolicy)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fallbackPolicy'],
        message: 'GRAPHBEPI_REQUIRES_FIXTURE_POLICY',
      });
    }
  });

export const configurationApproval = z
  .object({
    decision: z.literal('APPROVE'),
    expectedConfigurationHash: sha256,
    note: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
export const retryParams = z.object({ runId: uuid, stageKey: z.string().min(1).max(100) }).strict();
export const retryBody = z.object({ expectedAttempt: z.number().int().positive() }).strict();
export const eventHistoryQuery = z
  .object({
    limit: z.coerce.number().int().positive().max(500).default(100),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export const candidateListQuery = z
  .object({
    track: z.enum(['MHCI', 'MHCII', 'BCELL']).optional(),
    category: z.enum(['RECOMMENDED', 'REVIEW', 'REJECTED']).optional(),
    sourceStatus: z.enum(['LIVE', 'CACHED', 'SYNTHETIC', 'FIXTURE', 'FAILED']).optional(),
    allele: z.string().min(1).optional(),
    minScore: z.coerce.number().min(0).max(1).optional(),
    maxScore: z.coerce.number().min(0).max(1).optional(),
    search: z.string().trim().min(1).max(200).optional(),
    hasWarnings: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    sort: z.enum(['rank', 'score', 'start']).default('rank'),
    limit: z.coerce.number().int().positive().max(500).default(50),
    cursor: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.minScore === undefined ||
      value.maxScore === undefined ||
      value.minScore <= value.maxScore,
    { path: ['minScore'], message: 'minScore must not exceed maxScore' },
  );
export const compareCandidates = z
  .object({
    candidateIds: z.array(uuid).min(2).max(5),
  })
  .strict()
  .refine((value) => new Set(value.candidateIds).size === value.candidateIds.length, {
    path: ['candidateIds'],
    message: 'candidateIds must be unique',
  });
export const coverageQuery = z
  .object({
    populationId: z.string().min(1),
    purpose: z.enum(['CANDIDATE_RANKING', 'SHORTLIST_OPTIMIZATION', 'FINAL_SHORTLIST']),
    candidateId: uuid.optional(),
  })
  .strict();
export const shortlistOptimizationQuery = z.object({ track: z.enum(['MHCI', 'MHCII']) }).strict();
export const shortlistApproval = z
  .object({
    decision: z.literal('APPROVE'),
    expectedRankingSnapshotHash: sha256,
    approvedCandidateIds: z.array(uuid),
    excludedCandidateIds: z.array(uuid),
    allowEmpty: z.boolean().optional(),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.approvedCandidateIds.length === 0 && !(value.allowEmpty === true && value.note)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvedCandidateIds'],
        message:
          'At least one candidate is required unless an empty shortlist is explicitly approved with a note',
      });
    }
  });

export const evidenceGraphQuery = z
  .object({
    candidateId: uuid.optional(),
    depth: z.coerce.number().int().min(1).max(4).default(2),
  })
  .strict();
export const visualizationParams = z
  .object({
    runId: uuid,
    type: z.enum([
      'sequence-map',
      'population-coverage',
      'constraint-summary',
      'score-distribution',
      'connector-status',
    ]),
  })
  .strict();
export const explanationBody = z
  .object({
    mode: z.enum(['DETERMINISTIC', 'LLM']),
    audience: z.enum(['RESEARCHER', 'JUDGE']),
  })
  .strict();
export const reportBody = z
  .object({
    formats: z.array(reportFormat).min(1),
    templateVersion: z.string().min(1),
    includeWorkflowTrace: z.boolean(),
    includeEvidenceGraph: z.boolean(),
  })
  .strict()
  .refine((value) => new Set(value.formats).size === value.formats.length, {
    path: ['formats'],
    message: 'formats must be unique',
  });
export const agentMode = z.enum(['LLM', 'DETERMINISTIC']);
export const agentWorkflowBody = z
  .object({
    objective: z.string().trim().min(1).max(2_000),
    agentMode,
    approvedToolNames: z.array(z.string().trim().min(1)).min(1),
    requireHumanApproval: z.boolean(),
  })
  .strict();
export const agentChatBody = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    evidenceSummary: z.record(z.unknown()).default({}),
    agentMode,
  })
  .strict();
export const idempotencyHeaders = z
  .object({
    'idempotency-key': z.string().min(1).max(200).optional(),
  })
  .passthrough();
