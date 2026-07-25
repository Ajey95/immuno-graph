import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { access, lstat, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

import type { ArtifactDownload } from '../services.js';
import { ApplicationError, artifactNotFound } from './errors.js';

export interface ArtifactFileRecord {
  relativePath: string;
  byteSize: number;
  sha256: string;
  mimeType: string;
}

export class ArtifactStore {
  private readonly resolvedRoot: string;

  constructor(root: string) {
    this.resolvedRoot = resolve(root);
  }

  private containedPath(relativePath: string): string {
    if (isAbsolute(relativePath)) throw integrityError();
    const target = resolve(this.resolvedRoot, relativePath);
    const fromRoot = relative(this.resolvedRoot, target);
    if (
      fromRoot === '..' ||
      fromRoot.startsWith(`..\\`) ||
      fromRoot.startsWith('../') ||
      isAbsolute(fromRoot)
    ) {
      throw integrityError();
    }
    return target;
  }

  async open(record: ArtifactFileRecord): Promise<ArtifactDownload> {
    const target = this.containedPath(record.relativePath);
    let statistics;
    try {
      statistics = await lstat(target);
    } catch {
      throw artifactNotFound();
    }
    if (!statistics.isFile()) throw integrityError();
    if (statistics.size !== record.byteSize) throw integrityError();
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(target)) hash.update(chunk as Buffer);
    if (hash.digest('hex') !== record.sha256) throw integrityError();
    return {
      stream: createReadStream(target),
      filename: basename(record.relativePath),
      mediaType: record.mimeType,
      contentLength: record.byteSize,
    };
  }

  async write(
    relativePath: string,
    contents: string,
    mimeType: string,
  ): Promise<ArtifactFileRecord> {
    return this.writeBytes(relativePath, Buffer.from(contents, 'utf8'), mimeType);
  }

  async writeBytes(
    relativePath: string,
    contents: Buffer,
    mimeType: string,
  ): Promise<ArtifactFileRecord> {
    const target = this.containedPath(relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, { flag: 'wx' });
    return {
      relativePath,
      byteSize: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
      mimeType,
    };
  }

  async remove(records: readonly ArtifactFileRecord[]): Promise<void> {
    for (const record of records) {
      const target = this.containedPath(record.relativePath);
      await rm(target, { force: true, recursive: false });
    }
  }

  async health(): Promise<'AVAILABLE' | 'UNAVAILABLE'> {
    try {
      await access(this.resolvedRoot, constants.R_OK | constants.W_OK);
      return 'AVAILABLE';
    } catch {
      return 'UNAVAILABLE';
    }
  }
}

function integrityError(): ApplicationError {
  return new ApplicationError(
    'ARTIFACT_INTEGRITY_ERROR',
    409,
    'The artifact failed path or integrity verification.',
  );
}
