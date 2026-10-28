import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { createHttpServer, settingsFromEnvironment } from '../src/http-server.js';

test('standard MCP client discovers and calls the preserved scientific tools', async () => {
  const client = new Client({ name: 'immunograph-test-client', version: '1.0.0' });
  const packedEntry = process.env.IMMUNOGRAPH_TEST_ENTRY;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: packedEntry ? [packedEntry] : ['--import', 'tsx', join(process.cwd(), 'src', 'index.ts')],
    cwd: process.cwd(),
  });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 46);
    assert.equal(new Set(tools.map((tool) => tool.name)).size, 46);
    assert.ok(tools.every((tool) => tool.inputSchema));
    assert.match(JSON.stringify(tools.find((tool) => tool.name === 'validate_sequence')?.inputSchema), /fasta/);

    const result = await client.callTool({
      name: 'validate_sequence',
      arguments: { fasta: '>test\nACDEFGHIK' },
    });
    assert.equal(result.isError, false);
    const output = result.structuredContent as { ok: boolean; data: { normalizedSequence: string; sha256: string } };
    assert.equal(output.ok, true);
    assert.equal(output.data.normalizedSequence, 'ACDEFGHIK');

    const candidates = await client.callTool({
      name: 'generate_candidate_peptides',
      arguments: { sequence: output.data.normalizedSequence, candidateType: 'MHCI', peptideLengths: [9] },
    });
    assert.equal(candidates.isError, false);
    const candidateData = candidates.structuredContent as { ok: boolean; data: { candidates: unknown[] } };
    assert.equal(candidateData.data.candidates.length, 1);

    const synthetic = await client.callTool({
      name: 'predict_synthetic_binding',
      arguments: {
        runId: 'test-run',
        proteinHash: output.data.sha256,
        candidateType: 'MHCI',
        candidates: candidateData.data.candidates,
        alleles: ['HLA-A*02:01'],
        method: 'synthetic-binding',
        methodVersion: '1.0.0',
        datasetVersion: 'synthetic-v1',
      },
    });
    assert.equal(synthetic.isError, false);
    const prediction = synthetic.structuredContent as { ok: boolean; data: { provenance: { status: string } } };
    assert.equal(prediction.data.provenance.status, 'SYNTHETIC');

    const workflow = await client.callTool({
      name: 'describe_agentic_workflow',
      arguments: { runId: 'test-run', runIntent: 'MVP_EPITOPE_PRIORITIZATION', includeFutureInterfaces: false },
    });
    assert.equal(workflow.isError, false);
    const description = workflow.structuredContent as { ok: boolean; data: { deploymentBoundary: string } };
    assert.equal(description.data.deploymentBoundary, 'ONE_STANDARD_MCP_SERVER');

    const box = await client.callTool({
      name: 'validate_docking_box',
      arguments: {
        runId: 'test-run', dockingBoxId: 'box-1',
        center: { x: 1, y: 2, z: 3 }, size: { x: 10, y: 12, z: 14 },
      },
    });
    assert.equal(box.isError, false);
    const boxData = box.structuredContent as { ok: boolean; data: { valid: boolean; volume: number; provenance: { status: string } } };
    assert.equal(boxData.ok, true);
    assert.equal(boxData.data.valid, true);
    assert.equal(boxData.data.volume, 1680);
    assert.equal(boxData.data.provenance.status, 'LIVE');

    const mixedBcell = await client.callTool({
      name: 'predict_bcell',
      arguments: {
        runId: 'test-run', proteinRef: 'sample', sequence: 'MKWVTFISLLFLFSSAYS',
        methods: ['bepipred-3.0', 'parker'], parameters: {}, fallbackPolicy: 'LIVE_ONLY',
      },
    });
    assert.equal(mixedBcell.isError, true);
    const mixedBcellData = mixedBcell.structuredContent as { ok: boolean; error: { code: string } };
    assert.equal(mixedBcellData.error.code, 'BEPIPRED_SINGLE_METHOD_REQUIRED');

    const invalid = await client.callTool({ name: 'validate_sequence', arguments: { fasta: '' } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
  }
});

test('HTTP transport enforces bearer authentication and serves MCP tools', async () => {
  assert.throws(
    () => settingsFromEnvironment({ HOST: '0.0.0.0', PORT: '3000' }),
    /Remote HTTP requires/,
  );
  const apiKey = 'a'.repeat(32);
  const settings = settingsFromEnvironment({ HOST: '127.0.0.1', PORT: '0', IMMUNOGRAPH_API_KEY: apiKey });
  const { server, handler } = createHttpServer(settings);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const url = new URL(`http://127.0.0.1:${port}/mcp`);
  const client = new Client({ name: 'immunograph-http-test', version: '1.0.0' });
  try {
    const denied = await fetch(url, { method: 'POST' });
    assert.equal(denied.status, 401);
    const health = await fetch(new URL('/health', url));
    assert.equal(health.status, 200);

    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    });
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 46);
    const result = await client.callTool({ name: 'validate_sequence', arguments: { fasta: '>http\nACDEFGHIK' } });
    assert.equal(result.isError, false);
  } finally {
    await client.close();
    await handler.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
