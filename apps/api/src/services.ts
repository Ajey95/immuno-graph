import type { Readable } from 'node:stream';

export type ApiOperation =
  | 'projects.create'
  | 'projects.list'
  | 'projects.get'
  | 'projects.delete'
  | 'runs.create'
  | 'runs.get'
  | 'runs.approveConfiguration'
  | 'runs.start'
  | 'runs.cancel'
  | 'runs.retryStage'
  | 'events.history'
  | 'candidates.list'
  | 'candidates.get'
  | 'candidates.compare'
  | 'coverage.get'
  | 'coverage.getShortlistOptimization'
  | 'runs.approveShortlist'
  | 'graphs.evidence'
  | 'graphs.workflow'
  | 'visualizations.get'
  | 'connectors.list'
  | 'connectors.health'
  | 'explanations.generate'
  | 'reports.create'
  | 'artifacts.list'
  | 'agents.runWorkflow'
  | 'agents.chat'
  | 'settings.profiles'
  | 'settings.runtime';

export interface ApiServiceContext {
  requestId: string;
  idempotencyKey?: string;
}

export interface WorkflowSseEvent {
  id: string;
  event:
    | 'run.status_changed'
    | 'stage.status_changed'
    | 'stage.progress'
    | 'connector.status_changed'
    | 'approval.required'
    | 'candidate.summary_ready'
    | 'artifact.created'
    | 'run.warning';
  data: Record<string, unknown>;
}

export interface ArtifactDownload {
  stream: Readable;
  filename: string;
  mediaType: string;
  contentLength?: number;
}

export interface RestApiServices {
  execute(
    operation: ApiOperation,
    input: Record<string, unknown>,
    context: ApiServiceContext,
  ): Promise<unknown>;
  streamRunEvents(
    input: { runId: string; lastEventId?: string; signal?: AbortSignal },
    context: ApiServiceContext,
  ): AsyncIterable<WorkflowSseEvent>;
  downloadArtifact(
    input: { artifactId: string },
    context: ApiServiceContext,
  ): Promise<ArtifactDownload>;
}
