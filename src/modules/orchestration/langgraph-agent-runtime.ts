import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { canonicalJsonSha256 } from '../../lib/algorithms/index.js';

import { describeAgenticWorkflow } from './agent-manifest.js';
import { generateGroundedLlmText } from './llm-provider.js';

const REACT_LOOP = ['PLAN', 'ACT', 'OBSERVE', 'VERIFY', 'DECIDE'] as const;

export type AgentMode = 'LLM' | 'DETERMINISTIC';
export type AgentWorkflowStatus = 'COMPLETED' | 'AWAITING_APPROVAL' | 'ABSTAINED';

export interface AgentWorkflowStep {
  agentId: string;
  iteration: number;
  loop: typeof REACT_LOOP;
  selectedAction: string;
  toolNames: string[];
  observation: string;
  verification: 'PASSED' | 'PLANNED' | 'REQUIRES_APPROVAL' | 'ABSTAINED';
  decision: 'CONTINUE' | 'REQUEST_APPROVAL' | 'ABSTAIN' | 'COMPLETE';
  inputHash: string;
  outputHash: string;
}

export interface RunAgenticWorkflowInput {
  runId: string;
  objective: string;
  agentMode: AgentMode;
  approvedToolNames: string[];
  requireHumanApproval: boolean;
  toolCalls?: Array<{ toolName: string; arguments: Record<string, unknown> }>;
}

type ToolResult = { agentId: string; toolName: string; result: unknown };

export interface RunAgenticWorkflowResult {
  runtime: 'LANGGRAPH';
  agentMode: AgentMode;
  llmUsed: boolean;
  status: AgentWorkflowStatus;
  nextApprovalGate: string | null;
  steps: AgentWorkflowStep[];
  toolResults: ToolResult[];
  warnings: string[];
}

type AgentState = RunAgenticWorkflowInput & {
  steps: AgentWorkflowStep[];
  toolResults: ToolResult[];
  warnings: string[];
  status: AgentWorkflowStatus;
  nextApprovalGate: string | null;
};

interface GraphBuilderAdapter {
  addNode(name: string, action: (state: AgentState) => Promise<AgentStateUpdate> | AgentStateUpdate): GraphBuilderAdapter;
  addEdge(from: string, to: string): GraphBuilderAdapter;
  compile(): { invoke(input: AgentState): Promise<AgentState> };
}

type AgentStateUpdate = Partial<Omit<AgentState, 'steps' | 'warnings' | 'toolResults'>> & {
  steps?: AgentWorkflowStep | AgentWorkflowStep[];
  warnings?: string | string[];
  toolResults?: ToolResult | ToolResult[];
};

const AgentStateAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  objective: Annotation<string>(),
  agentMode: Annotation<AgentMode>(),
  approvedToolNames: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  toolCalls: Annotation<Array<{ toolName: string; arguments: Record<string, unknown> }> | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  requireHumanApproval: Annotation<boolean>(),
  steps: Annotation<AgentWorkflowStep[], AgentWorkflowStep | AgentWorkflowStep[]>({
    reducer: (left, right) => left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
  toolResults: Annotation<ToolResult[], ToolResult | ToolResult[]>({
    reducer: (left, right) => left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
  warnings: Annotation<string[], string | string[]>({
    reducer: (left, right) => left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
  status: Annotation<AgentWorkflowStatus>(),
  nextApprovalGate: Annotation<string | null>(),
});

const NODE_ORDER = [
  'supervisor-orchestrator',
  'intake-policy',
  'sequence-validation',
  't-cell',
  'b-cell',
  'population',
  'structure',
  'compound-intelligence',
  'docking',
  'ranking',
  'verifier-critic',
  'reporting',
] as const;

const APPROVAL_GATES = new Set(['intake-policy', 'docking', 'verifier-critic', 'reporting']);
const SUPERVISOR_TOOL_NAMES = ['describe_agentic_workflow', 'run_agentic_workflow'] as const;

export async function runLangGraphAgentWorkflow(
  input: RunAgenticWorkflowInput,
  invokeTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<RunAgenticWorkflowResult> {
  if (input.toolCalls?.length && !invokeTool) throw new Error('Live workflow tool dispatcher is unavailable.');
  const llmPlan =
    input.agentMode === 'LLM'
      ? await generateGroundedLlmText({
          purpose: 'WORKFLOW_PLANNING',
          prompt: input.objective,
          evidence: {
            deploymentBoundary: 'One standard MCP server',
            allowedRole:
              'Plan and route typed tools only; do not generate scientific prediction values.',
          },
        })
      : { used: false, text: null, warning: null };
  const manifest = describeAgenticWorkflow({
    runId: input.runId,
    runIntent: 'MVP_EPITOPE_PRIORITIZATION',
    includeFutureInterfaces: true,
  });
  for (const call of input.toolCalls ?? []) {
    const eligible = manifest.workflowPlan.nodes.some((node) => node.toolNames.includes(call.toolName));
    if (!eligible || !input.approvedToolNames.includes(call.toolName) || call.toolName === 'run_agentic_workflow') {
      throw new Error(`Tool ${call.toolName} is not approved for this workflow.`);
    }
  }
  if (new Set((input.toolCalls ?? []).map((call) => call.toolName)).size !== (input.toolCalls ?? []).length) {
    throw new Error('Each tool may be called once per workflow; use separate runs for repeated calls.');
  }
  let graph = new StateGraph(AgentStateAnnotation) as unknown as GraphBuilderAdapter;
  for (const agentId of NODE_ORDER) {
    const agent = manifest.agents.find((candidate) => candidate.agentId === agentId);
    if (agent === undefined) continue;
    graph = graph.addNode(agentId, async (state: AgentState) => {
      const node = manifest.workflowPlan.nodes.find((candidate) => candidate.agentId === agentId);
      const configuredToolNames =
        node?.toolNames ?? (agentId === 'supervisor-orchestrator' ? SUPERVISOR_TOOL_NAMES : []);
      const toolNames = configuredToolNames.filter((toolName) =>
        state.approvedToolNames.includes(toolName),
      );
      const pendingCalls = (state.toolCalls ?? []).filter((call) => toolNames.includes(call.toolName) && !state.toolResults.some((item) => item.toolName === call.toolName));
      const approvalRequired = state.requireHumanApproval && APPROVAL_GATES.has(agentId) && pendingCalls.length > 0;
      const blocked = state.status === 'AWAITING_APPROVAL' || state.toolResults.some((item) => typeof item.result !== 'object' || item.result === null || !('ok' in item.result) || item.result.ok !== true);
      const toolResults: ToolResult[] = [];
      if (!blocked && !approvalRequired && invokeTool) {
        for (const call of pendingCalls) {
          const argumentsResolved = resolveArguments(call.arguments, [...state.toolResults, ...toolResults]) as Record<string, unknown>;
          const result = await invokeTool(call.toolName, argumentsResolved);
          toolResults.push({ agentId, toolName: call.toolName, result });
          if (typeof result !== 'object' || result === null || !('ok' in result) || result.ok !== true) break;
        }
      }
      const executionFailed = toolResults.some((item) => typeof item.result !== 'object' || item.result === null || !('ok' in item.result) || item.result.ok !== true);
      const verification: AgentWorkflowStep['verification'] =
        approvalRequired ? 'REQUIRES_APPROVAL' : blocked || executionFailed || (input.toolCalls?.length && toolResults.length === 0) || toolNames.length === 0 ? 'ABSTAINED' : input.toolCalls?.length ? 'PASSED' : 'PLANNED';
      const decision: AgentWorkflowStep['decision'] =
        verification === 'ABSTAINED'
          ? 'ABSTAIN'
          : approvalRequired
            ? 'REQUEST_APPROVAL'
            : agentId === 'reporting' && input.toolCalls?.length
              ? 'COMPLETE'
              : 'CONTINUE';
      const step = buildStep({
        runId: state.runId,
        objective: state.objective,
        agentId,
        iteration: 1,
        selectedAction: node?.label ?? agent.role,
        toolNames,
        verification,
        decision,
        observation: toolResults.length > 0 ? `Executed ${toolResults.length} approved typed tool call(s); ${executionFailed ? 'a tool failed' : 'all returned ok'}.` : undefined,
      });
      const warnings =
        toolNames.length === 0 && !input.toolCalls?.length
          ? [`${agentId}-has-no-approved-tools-and-abstained`]
          : state.agentMode === 'LLM' && llmPlan.used
            ? [`${agentId}-llm-grounded-routing-note-recorded`]
            : [];
      return {
        steps: step,
        toolResults,
        warnings,
        status:
          blocked || verification === 'ABSTAINED'
            ? 'ABSTAINED'
            : approvalRequired
              ? 'AWAITING_APPROVAL'
              : state.status,
        nextApprovalGate: approvalRequired ? approvalGateFor(agentId) : state.nextApprovalGate,
      };
    });
  }

  const firstNode = NODE_ORDER[0];
  const lastNode = NODE_ORDER[NODE_ORDER.length - 1];
  if (firstNode === undefined || lastNode === undefined) {
    throw new Error('Agent workflow node order is empty.');
  }
  let wired = graph.addEdge(START, firstNode);
  for (let index = 0; index < NODE_ORDER.length - 1; index += 1) {
    const from = NODE_ORDER[index];
    const to = NODE_ORDER[index + 1];
    if (from !== undefined && to !== undefined) {
      wired = wired.addEdge(from, to);
    }
  }
  const compiled = wired.addEdge(lastNode, END).compile();
  const state = await compiled.invoke({
    ...input,
    steps: [],
    toolResults: [],
    warnings: [],
    status: 'COMPLETED',
    nextApprovalGate: null,
  });
  const firstApproval = state.steps.find(
    (step: AgentWorkflowStep) => step.decision === 'REQUEST_APPROVAL',
  );
  return {
    runtime: 'LANGGRAPH',
    agentMode: input.agentMode,
    llmUsed: llmPlan.used,
    status: firstApproval !== undefined ? 'AWAITING_APPROVAL' : input.toolCalls?.length
      ? state.toolResults.length === input.toolCalls.length && state.toolResults.every((item) => typeof item.result === 'object' && item.result !== null && 'ok' in item.result && item.result.ok === true) ? 'COMPLETED' : 'ABSTAINED'
      : state.status,
    nextApprovalGate:
      firstApproval === undefined ? state.nextApprovalGate : approvalGateFor(firstApproval.agentId),
    steps: state.steps,
    toolResults: state.toolResults,
    warnings:
      input.agentMode === 'LLM' && !llmPlan.used
        ? [
            llmPlan.warning ?? 'llm-provider-unavailable-deterministic-agent-routing-used',
            ...(input.toolCalls?.length ? [] : ['workflow-plan-only-no-scientific-tool-calls']),
            ...state.warnings,
          ]
        : [...(input.toolCalls?.length ? [] : ['workflow-plan-only-no-scientific-tool-calls']), ...state.warnings],
  };
}

function resolveArguments(value: unknown, results: ToolResult[], depth = 0): unknown {
  if (depth > 12) throw new Error('Workflow argument references are too deeply nested.');
  if (Array.isArray(value)) return value.map((item) => resolveArguments(item, results, depth + 1));
  if (typeof value !== 'object' || value === null) return value;
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length === 1 && typeof object.$result === 'string') {
    const [toolName, ...path] = object.$result.split('.');
    const prior = results.find((item) => item.toolName === toolName);
    if (!prior || path.length === 0) throw new Error(`Unavailable workflow result reference: ${object.$result}`);
    let current: unknown = prior.result;
    for (const segment of path) {
      if (typeof current !== 'object' || current === null || !Object.hasOwn(current, segment)) {
        throw new Error(`Unavailable workflow result reference: ${object.$result}`);
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, resolveArguments(item, results, depth + 1)]));
}

function buildStep(input: {
  runId: string;
  objective: string;
  agentId: string;
  iteration: number;
  selectedAction: string;
  toolNames: string[];
  verification: AgentWorkflowStep['verification'];
  decision: AgentWorkflowStep['decision'];
  observation?: string;
}): AgentWorkflowStep {
  const base = {
    runId: input.runId,
    objective: input.objective,
    agentId: input.agentId,
    selectedAction: input.selectedAction,
    toolNames: input.toolNames,
  };
  return {
    agentId: input.agentId,
    iteration: input.iteration,
    loop: REACT_LOOP,
    selectedAction: input.selectedAction,
    toolNames: input.toolNames,
    observation: input.observation ?? (
      input.toolNames.length === 0
        ? 'No approved typed tools were available for this agent.'
        : 'Plan selected typed tool names; this workflow did not execute scientific tools.'),
    verification: input.verification,
    decision: input.decision,
    inputHash: canonicalJsonSha256(base),
    outputHash: canonicalJsonSha256({ ...base, decision: input.decision }),
  };
}

function approvalGateFor(agentId: string): string {
  if (agentId === 'intake-policy') return 'configuration_approval';
  if (agentId === 'docking') return 'docking_approval';
  if (agentId === 'verifier-critic') return 'shortlist_approval';
  if (agentId === 'reporting') return 'export_approval';
  return `${agentId}_approval`;
}
