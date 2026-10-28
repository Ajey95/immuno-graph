import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'immunograph-live-workflow-verifier', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [join(process.cwd(), 'dist', 'index.js')], cwd: process.cwd() });
await client.connect(transport);
async function call(name: string, args: Record<string, unknown>) {
  const response = await client.callTool({ name, arguments: args }, { timeout: 120000 });
  return response.structuredContent as { ok: boolean; data?: Record<string, any>; error?: { code: string; message: string } };
}
try {
  const labeled = Array.from({ length: 40 }, (_, i) => ({ score: (i + 0.5) / 40, outcome: i >= 20 ? 1 as const : 0 as const }));
  for (const method of ['PLATT', 'ISOTONIC'] as const) {
    const result = await call('calibrate_confidence', {
      runId: 'live-calibration', method,
      predictions: [{ entityId: 'candidate-high', score: 0.9, agreement: 0.8, completeness: 1, evidenceCount: 3 }],
      calibrationSamples: labeled.filter((_, index) => index % 2 === 0),
      evaluationSamples: labeled.filter((_, index) => index % 2 === 1),
    });
    assert.equal(result.ok, true, `${method}: ${result.error?.message}`);
    assert.equal(result.data?.reliability.evaluationCount, 20);
    assert.ok(result.data?.reliability.brierScore < 0.2);
    assert.equal(result.data?.provenance.status, 'LIVE');
  }
  const workflow = await call('run_agentic_workflow', {
    runId: 'live-workflow', objective: 'Validate supplied sequence', agentMode: 'DETERMINISTIC',
    approvedToolNames: ['validate_sequence', 'generate_candidate_peptides'], requireHumanApproval: false,
    toolCalls: [
      { toolName: 'validate_sequence', arguments: { fasta: '>sample\nACDEFGHIK' } },
      { toolName: 'generate_candidate_peptides', arguments: { runId: 'live-workflow', sequence: { $result: 'validate_sequence.data.normalizedSequence' }, candidateType: 'MHCI', peptideLengths: [9] } },
    ],
  });
  assert.equal(workflow.ok, true, workflow.error?.message);
  assert.equal(workflow.data?.status, 'COMPLETED');
  assert.equal(workflow.data?.toolResults.length, 2);
  assert.equal(workflow.data?.toolResults[0].result.data.normalizedSequence, 'ACDEFGHIK');
  assert.equal(workflow.data?.toolResults[1].result.data.candidates[0].peptide, 'ACDEFGHIK');
  const denied = await call('run_agentic_workflow', {
    runId: 'denied-workflow', objective: 'Reject unapproved call', agentMode: 'DETERMINISTIC',
    approvedToolNames: ['validate_sequence'], requireHumanApproval: false,
    toolCalls: [{ toolName: 'run_docking', arguments: {} }],
  });
  assert.equal(denied.ok, false);
  const gated = await call('run_agentic_workflow', {
    runId: 'gated-workflow', objective: 'Dock after approval', agentMode: 'DETERMINISTIC',
    approvedToolNames: ['run_docking'], requireHumanApproval: true,
    toolCalls: [{ toolName: 'run_docking', arguments: {} }],
  });
  assert.equal(gated.ok, true, gated.error?.message);
  assert.equal(gated.data?.status, 'AWAITING_APPROVAL');
  assert.equal(gated.data?.toolResults.length, 0);
  console.log(JSON.stringify({ calibration: ['PLATT', 'ISOTONIC'], workflowStatus: workflow.data?.status, executedTools: workflow.data?.toolResults.map((item: any) => item.toolName), unauthorizedCallRejected: true, approvalGate: gated.data?.nextApprovalGate }));
} finally { await client.close(); }
