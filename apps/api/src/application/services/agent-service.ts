import { z } from 'zod';

import type { ApiServiceContext } from '../../services.js';
import type { McpToolGateway } from '../mcp-tool-gateway.js';

const agentMode = z.enum(['LLM', 'DETERMINISTIC']);
const runAgenticWorkflowData = z
  .object({
    runtime: z.literal('LANGGRAPH'),
    agentMode,
    llmUsed: z.boolean(),
    status: z.enum(['COMPLETED', 'AWAITING_APPROVAL', 'ABSTAINED']),
    nextApprovalGate: z.string().nullable(),
    steps: z.array(z.record(z.unknown())),
    warnings: z.array(z.string()),
  })
  .strict();
const chatData = z
  .object({
    answer: z.string(),
    grounded: z.boolean(),
    citedEvidenceKeys: z.array(z.string()),
    limitations: z.array(z.string()),
    agentMode,
    llmUsed: z.boolean(),
  })
  .strict();

export class AgentService {
  constructor(private readonly gateway: McpToolGateway) {}

  async runWorkflow(
    input: {
      runId: string;
      objective: string;
      agentMode: z.infer<typeof agentMode>;
      approvedToolNames: string[];
      requireHumanApproval: boolean;
    },
    context: ApiServiceContext,
  ) {
    const result = await this.gateway.call('run_agentic_workflow', input, runAgenticWorkflowData, {
      requestId: context.requestId,
      runId: input.runId,
    });
    return result.data;
  }

  async chat(
    input: {
      runId: string;
      question: string;
      evidenceSummary: Record<string, unknown>;
      agentMode: z.infer<typeof agentMode>;
    },
    context: ApiServiceContext,
  ) {
    const result = await this.gateway.call('chat_with_research_agent', input, chatData, {
      requestId: context.requestId,
      runId: input.runId,
    });
    return result.data;
  }
}
