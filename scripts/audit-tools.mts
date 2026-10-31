import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { registeredHandlers } from '../src/modules/common/mcp-compat.js';
import { createToolGroups } from '../src/modules/tool-catalog.js';

const client = new Client({ name: 'immunograph-tool-audit', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(process.cwd(), 'dist', 'index.js')],
  cwd: process.cwd(),
});

await client.connect(transport);
let failures = 0;
try {
  const listed = await client.listTools();
  const handlers = createToolGroups().flatMap((group) =>
    registeredHandlers(group.controller).map(({ options }) => ({ group: group.name, options })),
  );
  assert.equal(listed.tools.length, 46);
  assert.deepEqual(
    new Set(listed.tools.map((tool) => tool.name)),
    new Set(handlers.map(({ options }) => options.name)),
  );
  console.log(JSON.stringify({ listed: listed.tools.length }));
  for (const { group, options } of handlers) {
      const request = structuredClone((options.examples as { request: Record<string, unknown> }).request);
      const started = Date.now();
      try {
        const response = await client.callTool(
          { name: options.name, arguments: request },
          { timeout: 15000 },
        );
        const value = response.structuredContent as {
          ok?: boolean;
          error?: { code?: string; message?: string };
          data?: Record<string, unknown>;
        } | undefined;
        if (value?.ok === true && value.data) verifyDocumentedOutput(options.name, value.data);
        const status = value?.ok === true && response.isError !== true && response.content.length > 0
          ? 'ok' : 'tool_error';
        if (status !== 'ok') failures += 1;
        console.log(JSON.stringify({
          group,
          name: options.name,
          status,
          errorCode: value?.error?.code,
          errorMessage: value?.error?.message,
          durationMs: Date.now() - started,
          dataKeys: value?.data ? Object.keys(value.data) : undefined,
        }));
      } catch (error) {
        failures += 1;
        console.log(JSON.stringify({
          group,
          name: options.name,
          status: 'protocol_error',
          errorMessage: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - started,
        }));
      }
  }
} finally {
  await client.close();
}
if (failures > 0) {
  console.error(`${failures} documented MCP tool examples failed`);
  process.exitCode = 1;
}

function verifyDocumentedOutput(name: string, data: Record<string, unknown>): void {
  if (name === 'export_candidates') {
    assert.match(verifyArtifact(data), /rawScore,normalizedScore,sourceStatus/);
  }
  if (name === 'export_workflow_trace') {
    assert.equal(data.eventCount, 1);
    const trace = JSON.parse(verifyArtifact(data.artifact as Record<string, unknown>));
    assert.deepEqual(Object.keys(trace.events[0]), ['eventId', 'stage', 'status', 'at']);
  }
  if (name === 'generate_report') {
    for (const artifact of data.artifacts as Record<string, unknown>[]) verifyArtifact(artifact);
  }
  if (name === 'visualize_results') {
    assert.equal((data.viewModel as Record<string, unknown>).itemCount, 1);
  }
}

function verifyArtifact(artifact: Record<string, unknown>): string {
  const bytes = Buffer.from(artifact.contentBase64 as string, 'base64');
  assert.equal(bytes.byteLength, artifact.byteLength);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  return bytes.toString('utf8');
}
