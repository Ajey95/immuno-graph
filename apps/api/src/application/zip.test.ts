import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildStoredZip } from './zip.js';

describe('buildStoredZip', () => {
  it('creates a deterministic zip containing every requested file', () => {
    const zip = buildStoredZip([
      { path: 'manifest.json', data: Buffer.from('{"ok":true}', 'utf8') },
      { path: 'reports/summary.md', data: Buffer.from('# Summary\n', 'utf8') },
    ]);

    expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(listZipEntries(zip)).toEqual(['manifest.json', 'reports/summary.md']);
    expect(createHash('sha256').update(zip).digest('hex')).toMatch(/^[a-f0-9]{64}$/);
  });
});

function listZipEntries(zip: Buffer): string[] {
  const names: string[] = [];
  let offset = 0;
  while (offset < zip.length) {
    const signature = zip.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const compressedSize = zip.readUInt32LE(offset + 18);
    const fileNameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(zip.subarray(nameStart, nameStart + fileNameLength).toString('utf8'));
    offset = nameStart + fileNameLength + extraLength + compressedSize;
  }
  return names;
}
