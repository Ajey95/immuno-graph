import { createHash } from 'node:crypto';
import { z } from 'zod';

export const inlineArtifactSchema = z.object({
  artifactId: z.string().min(1),
  fileName: z.string().min(1),
  mediaType: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
  reference: z.string().min(1),
  contentBase64: z.string().min(1),
}).strict();

export function inlineArtifact(
  artifactId: string,
  fileName: string,
  mediaType: string,
  reference: string,
  contents: string | Buffer,
) {
  const bytes = typeof contents === 'string' ? Buffer.from(contents, 'utf8') : contents;
  return {
    artifactId,
    fileName,
    mediaType,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
    reference,
    contentBase64: bytes.toString('base64'),
  };
}
