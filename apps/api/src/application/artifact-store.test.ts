import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ArtifactStore } from './artifact-store.js';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

describe('ArtifactStore', () => {
  it('streams a contained file only after size and hash verification', async () => {
    const root = await mkdtemp(join(tmpdir(), 'immunograph-artifacts-'));
    roots.push(root);
    const body = 'artifact-body';
    await writeFile(join(root, 'report.json'), body);
    const store = new ArtifactStore(root);
    const download = await store.open({
      relativePath: 'report.json',
      byteSize: Buffer.byteLength(body),
      sha256: createHash('sha256').update(body).digest('hex'),
      mimeType: 'application/json',
    });
    const chunks = [];
    for await (const chunk of download.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('utf8')).toBe(body);
    expect(download.filename).toBe('report.json');
  });

  it('writes and streams a binary artifact with size and hash metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'immunograph-artifacts-'));
    roots.push(root);
    const store = new ArtifactStore(root);
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

    const record = await store.writeBytes('run-1/research-package.zip', bytes, 'application/zip');
    const download = await store.open(record);
    const chunks = [];
    for await (const chunk of download.stream) chunks.push(Buffer.from(chunk));

    expect(download.filename).toBe('research-package.zip');
    expect(download.mediaType).toBe('application/zip');
    expect(Buffer.concat(chunks)).toEqual(bytes);
  });

  it('rejects path escapes and integrity mismatches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'immunograph-artifacts-'));
    roots.push(root);
    const store = new ArtifactStore(root);
    await expect(
      store.open({
        relativePath: '../escape',
        byteSize: 0,
        sha256: 'a'.repeat(64),
        mimeType: 'text/plain',
      }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_ERROR' });
  });
});
