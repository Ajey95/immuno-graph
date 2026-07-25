import type { ApiOperation, ApiServiceContext, RestApiServices } from '../services.js';
import type { AgentService } from './services/agent-service.js';
import type { CandidateService } from './services/candidate-service.js';
import type { DiagnosticsService } from './services/diagnostics-service.js';
import type { EventService } from './services/event-service.js';
import type { EvidenceService } from './services/evidence-service.js';
import type { ProjectService } from './services/project-service.js';
import type { ReportService } from './services/report-service.js';
import type { RunService } from './services/run-service.js';

export interface FocusedApplicationServices {
  projects: ProjectService;
  runs: RunService;
  events: EventService;
  candidates: CandidateService;
  evidence: EvidenceService;
  reports: ReportService;
  diagnostics: DiagnosticsService;
  agents: AgentService;
}

export class ConcreteRestApiServices implements RestApiServices {
  constructor(private readonly services: FocusedApplicationServices) {}

  execute(
    operation: ApiOperation,
    input: Record<string, unknown>,
    context: ApiServiceContext,
  ): Promise<unknown> {
    switch (operation) {
      case 'projects.create':
        return this.services.projects.create(
          input as unknown as Parameters<ProjectService['create']>[0],
        );
      case 'projects.list':
        return this.services.projects.list(input as Parameters<ProjectService['list']>[0]);
      case 'projects.get':
        return this.services.projects.get(input.projectId as string);
      case 'projects.delete':
        return this.services.projects.delete(input as Parameters<ProjectService['delete']>[0]);
      case 'runs.create':
        return this.services.runs.create(input as Parameters<RunService['create']>[0]);
      case 'runs.get':
        return this.services.runs.get(input.runId as string);
      case 'runs.approveConfiguration':
        return this.services.runs.approveConfiguration(
          input as Parameters<RunService['approveConfiguration']>[0],
        );
      case 'runs.start':
        return this.services.runs.start(input as Parameters<RunService['start']>[0], context);
      case 'runs.cancel':
        return this.services.runs.cancel(input as Parameters<RunService['cancel']>[0], context);
      case 'runs.retryStage':
        return this.services.runs.retryStage(
          input as Parameters<RunService['retryStage']>[0],
          context,
        );
      case 'events.history':
        return this.services.events.history(input as Parameters<EventService['history']>[0]);
      case 'candidates.list':
        return this.services.candidates.list(input as Parameters<CandidateService['list']>[0]);
      case 'candidates.get':
        return this.services.candidates.get(input as Parameters<CandidateService['get']>[0]);
      case 'candidates.compare':
        return this.services.candidates.compare(
          input as Parameters<CandidateService['compare']>[0],
        );
      case 'coverage.get':
        return this.services.candidates.coverage(
          input as Parameters<CandidateService['coverage']>[0],
        );
      case 'coverage.getShortlistOptimization':
        return this.services.candidates.shortlistOptimization(
          input as Parameters<CandidateService['shortlistOptimization']>[0],
        );
      case 'runs.approveShortlist':
        return this.services.runs.approveShortlist(
          input as Parameters<RunService['approveShortlist']>[0],
        );
      case 'graphs.evidence':
        return this.services.evidence.evidence(input as Parameters<EvidenceService['evidence']>[0]);
      case 'graphs.workflow':
        return this.services.evidence.workflow(input.runId as string);
      case 'visualizations.get':
        return this.services.evidence.visualization(
          input as Parameters<EvidenceService['visualization']>[0],
        );
      case 'connectors.list':
        return this.services.diagnostics.connectors();
      case 'connectors.health':
        return this.services.diagnostics.connectorHealth();
      case 'explanations.generate':
        return this.services.reports.explanation(
          input as Parameters<ReportService['explanation']>[0],
        );
      case 'reports.create':
        return this.services.reports.createReport(
          input as Parameters<ReportService['createReport']>[0],
          context,
        );
      case 'artifacts.list':
        return this.services.reports.listArtifacts(input.runId as string);
      case 'agents.runWorkflow':
        return this.services.agents.runWorkflow(
          input as Parameters<AgentService['runWorkflow']>[0],
          context,
        );
      case 'agents.chat':
        return this.services.agents.chat(input as Parameters<AgentService['chat']>[0], context);
      case 'settings.profiles':
        return this.services.diagnostics.profiles();
      case 'settings.runtime':
        return this.services.diagnostics.runtime();
      default: {
        const exhaustive: never = operation;
        throw new Error(`Unhandled API operation: ${String(exhaustive)}`);
      }
    }
  }

  streamRunEvents(input: { runId: string; lastEventId?: string; signal?: AbortSignal }) {
    return this.services.events.stream(input);
  }

  downloadArtifact(input: { artifactId: string }) {
    return this.services.reports.downloadArtifact(input.artifactId);
  }
}
