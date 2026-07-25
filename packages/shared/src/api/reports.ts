import { z } from 'zod';

import { isoInstantSchema, sha256Schema, uuidSchema } from './common.js';

export const artifactSchema = z
  .object({
    id: uuidSchema,
    type: z.enum(['JSON', 'CSV', 'EVIDENCE_GRAPH', 'WORKFLOW_TRACE', 'RESEARCH_PACKAGE']),
    filename: z.string(),
    mediaType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    sha256: sha256Schema,
    createdAt: isoInstantSchema,
  })
  .strict();
export const artifactListSchema = z.object({ items: z.array(artifactSchema) }).strict();
export const reportJobSchema = z
  .object({
    artifactJobId: uuidSchema,
    status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
  })
  .strict();

export type Artifact = z.infer<typeof artifactSchema>;
