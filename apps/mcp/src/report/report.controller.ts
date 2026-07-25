import { createHash } from 'node:crypto';

import { explainCandidate } from '@immunograph/algorithms';
import { ControllerDecorator, ToolDecorator } from '@nitrostack/core';
import type { ExecutionContext } from '@nitrostack/core';
import type { z } from 'zod';

import type { CapabilityPort } from '../common/capability-port.js';
import { unavailableCapabilityPort } from '../common/capability-port.js';
import { executeTool } from '../common/executor.js';
import { describeAgenticWorkflow } from '../orchestration/agent-manifest.js';
import { runLangGraphAgentWorkflow } from '../orchestration/langgraph-agent-runtime.js';
import { generateGroundedLlmText } from '../orchestration/llm-provider.js';
import {
  chatWithResearchAgentContract,
  describeAgenticWorkflowContract,
  explainCandidateContract,
  exportCandidatesContract,
  exportResearchPackageContract,
  exportTraceContract,
  generateReportContract,
  runAgenticWorkflowContract,
  toolOptions,
  visualizeResultsContract,
} from '../tool-contracts.js';

const CATEGORY = 'Report / Export Tools';

@ControllerDecorator()
export class ReportController {
  private capabilities: CapabilityPort = unavailableCapabilityPort;

  useCapabilityPort(capabilities: CapabilityPort): this {
    this.capabilities = capabilities;
    return this;
  }

  @ToolDecorator(toolOptions(generateReportContract, CATEGORY))
  generateReport(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: generateReportContract.name,
      input,
      inputSchema: generateReportContract.inputSchema,
      dataSchema: generateReportContract.dataSchema,
      context,
      operation: async (validated) => {
        if (validated.reportSnapshot === undefined) {
          return this.capabilities.invoke(generateReportContract.name, validated) as Promise<
            z.infer<typeof generateReportContract.dataSchema>
          >;
        }
        const snapshot = validated.reportSnapshot;
        const artifacts = validated.outputFormats.map((format) => {
          const contents =
            format === 'CSV'
              ? reportCsv(snapshot.candidates, snapshot.disclaimer)
              : JSON.stringify(
                  {
                    schemaVersion: 'immunograph-report.v1',
                    runId: validated.runId,
                    executionMode: snapshot.executionMode,
                    runQuality: snapshot.runQuality,
                    scientificUse: snapshot.scientificUse,
                    disclaimer: snapshot.disclaimer,
                    candidates: snapshot.candidates,
                  },
                  null,
                  2,
                );
          const bytes = Buffer.from(contents, 'utf8');
          return {
            artifactId: `${validated.runId}-${format.toLowerCase()}`,
            mediaType: format === 'CSV' ? 'text/csv' : 'application/json',
            sha256: createHash('sha256').update(bytes).digest('hex'),
            byteLength: bytes.byteLength,
            reference: `mcp://reports/${validated.runId}/${format.toLowerCase()}`,
            contentBase64: bytes.toString('base64'),
          };
        });
        return {
          artifacts,
          disclaimer: snapshot.disclaimer,
          provenanceSummary: {
            executionMode: snapshot.executionMode,
            scientificUse: snapshot.scientificUse,
            generatedBy: 'NitroStack MCP generate_report',
          },
          runQuality: snapshot.runQuality,
        };
      },
    });
  }

  @ToolDecorator(toolOptions(exportCandidatesContract, CATEGORY))
  exportCandidates(input: unknown, context: ExecutionContext) {
    return this.invokeCapability(exportCandidatesContract, input, context);
  }

  @ToolDecorator(toolOptions(visualizeResultsContract, CATEGORY))
  visualizeResults(input: unknown, context: ExecutionContext) {
    return this.invokeCapability(visualizeResultsContract, input, context);
  }

  @ToolDecorator(toolOptions(explainCandidateContract, CATEGORY))
  explain(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: explainCandidateContract.name,
      input,
      inputSchema: explainCandidateContract.inputSchema,
      dataSchema: explainCandidateContract.dataSchema,
      context,
      operation: async (validated) => {
        const deterministic = explainCandidate({
          audience: validated.audience,
          candidateKey: validated.candidateKey,
          category: validated.category,
          trackRank: validated.trackRank,
          finalScore: validated.finalScore,
          componentScores: validated.componentScores,
          ruleOutcomes: validated.ruleOutcomes,
          provenanceStatuses: validated.provenanceStatuses,
        });
        if (validated.explanationMode === 'DETERMINISTIC') {
          return { deterministic, llmParaphrase: null };
        }
        try {
          const response = await this.capabilities.invoke('explain_candidate_llm_paraphrase', {
            runId: validated.runId,
            audience: validated.audience,
            deterministic,
          });
          return {
            deterministic,
            llmParaphrase:
              typeof response === 'string' && response.trim().length > 0 ? response : null,
          };
        } catch {
          context.logger.warn('mcp.tool.optional_paraphrase_unavailable', {
            requestId: context.requestId,
            runId: validated.runId,
            toolName: explainCandidateContract.name,
          });
          return { deterministic, llmParaphrase: null };
        }
      },
    });
  }

  @ToolDecorator(toolOptions(exportTraceContract, CATEGORY))
  exportWorkflowTrace(input: unknown, context: ExecutionContext) {
    return this.invokeCapability(exportTraceContract, input, context);
  }

  @ToolDecorator(toolOptions(describeAgenticWorkflowContract, CATEGORY))
  describeAgenticWorkflow(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: describeAgenticWorkflowContract.name,
      input,
      inputSchema: describeAgenticWorkflowContract.inputSchema,
      dataSchema: describeAgenticWorkflowContract.dataSchema,
      context,
      operation: (validated) => describeAgenticWorkflow(validated),
    });
  }

  @ToolDecorator(toolOptions(runAgenticWorkflowContract, CATEGORY))
  runAgenticWorkflow(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: runAgenticWorkflowContract.name,
      input,
      inputSchema: runAgenticWorkflowContract.inputSchema,
      dataSchema: runAgenticWorkflowContract.dataSchema,
      context,
      operation: runLangGraphAgentWorkflow,
    });
  }

  @ToolDecorator(toolOptions(chatWithResearchAgentContract, CATEGORY))
  chatWithResearchAgent(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: chatWithResearchAgentContract.name,
      input,
      inputSchema: chatWithResearchAgentContract.inputSchema,
      dataSchema: chatWithResearchAgentContract.dataSchema,
      context,
      operation: async (validated) => {
        const evidenceKeys = Object.keys(validated.evidenceSummary).sort();
        const grounded = evidenceKeys.length > 0;
        const llm =
          validated.agentMode === 'LLM' && grounded
            ? await generateGroundedLlmText({
                purpose: 'RESEARCH_CHAT',
                prompt: validated.question,
                evidence: Object.fromEntries(
                  Object.entries(validated.evidenceSummary).map(([key, value]) => [
                    key,
                    typeof value === 'string' ? value : JSON.stringify(value),
                  ]),
                ),
              })
            : { used: false, text: null, warning: null };
        const answer =
          evidenceKeys.length === 0
            ? 'I do not have stored evidence for this question, so I must abstain rather than infer scientific facts.'
            : (llm.text ??
              `Grounded answer from stored ImmunoGraph evidence: ${evidenceKeys.join(', ')}. Scientific values must be interpreted only with their recorded provenance.`);
        return {
          answer,
          grounded,
          citedEvidenceKeys: evidenceKeys,
          limitations: [
            ...(llm.warning === null ? [] : [llm.warning]),
            'LLM/chat responses cannot create new scientific facts.',
            'Use exported reports and provenance records for scientific review.',
          ],
          agentMode: validated.agentMode,
          llmUsed: llm.used,
        };
      },
    });
  }

  @ToolDecorator(toolOptions(exportResearchPackageContract, CATEGORY))
  exportResearchPackage(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: exportResearchPackageContract.name,
      input,
      inputSchema: exportResearchPackageContract.inputSchema,
      dataSchema: exportResearchPackageContract.dataSchema,
      context,
      operation: (validated) => {
        const requiredSections = [
          'manifest.json',
          'project.json',
          'run.json',
          'configuration.json',
          'inputs/',
          'predictions/',
          'candidates/',
          ...(validated.includeStructure ? ['structure/'] : []),
          ...(validated.includeChemistry ? ['compounds/'] : []),
          ...(validated.includeDocking ? ['docking/'] : []),
          'construct/',
          'evidence/',
          'reports/',
          'checksums.json',
        ];
        const contents = JSON.stringify(
          {
            schemaVersion: 'immunograph-research-package.v1.1',
            runId: validated.runId,
            requiredSections,
            includesCsvExports: true,
            includesAgentTrace: validated.includeAgentTrace,
          },
          null,
          2,
        );
        const bytes = Buffer.from(contents, 'utf8');
        return {
          artifact: {
            artifactId: `${validated.runId}-research-package`,
            mediaType: 'application/zip',
            sha256: createHash('sha256').update(bytes).digest('hex'),
            byteLength: bytes.byteLength,
            reference: `mcp://research-packages/${validated.runId}/research-package.zip`,
            contentBase64: bytes.toString('base64'),
          },
          requiredSections,
          includesCsvExports: true as const,
          includesAgentTrace: validated.includeAgentTrace,
        };
      },
    });
  }

  private invokeCapability<TInput extends z.ZodTypeAny, TData extends z.ZodTypeAny>(
    contract: { name: string; inputSchema: TInput; dataSchema: TData },
    input: unknown,
    context: ExecutionContext,
  ) {
    return executeTool({
      toolName: contract.name,
      input,
      inputSchema: contract.inputSchema,
      dataSchema: contract.dataSchema,
      context,
      operation: async (validated) =>
        this.capabilities.invoke(contract.name, validated) as Promise<z.infer<TData>>,
    });
  }
}

function reportCsv(rows: Array<Record<string, unknown>>, disclaimer: string): string {
  const columns = [
    'rank',
    'track',
    'peptide',
    'start',
    'end',
    'allele',
    'finalScore',
    'category',
    'sourceStatus',
    'scientificUse',
  ];
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return `# ${disclaimer}\n${columns.join(',')}\n${rows
    .map((row) => columns.map((column) => quote(row[column])).join(','))
    .join('\n')}\n`;
}
