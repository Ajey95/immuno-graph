import {
  createRepositories,
  PrismaTransactionManager,
  type DatabaseClient,
} from '@immunograph/database';

import type { ApiEnvironment } from '../config/environment.js';
import type { RestApiServices } from '../services.js';
import { ArtifactStore } from './artifact-store.js';
import { ConcreteRestApiServices } from './concrete-rest-api-services.js';
import { EventNotifier } from './event-notifier.js';
import {
  type ConnectorDiagnosticsPort,
  type ReportGenerationPort,
  type WorkflowExecutionPort,
} from './ports.js';
import { InlineFixtureWorkflowPort } from './inline-fixture-workflow-port.js';
import { HttpMcpToolGateway } from './http-mcp-tool-gateway.js';
import { LocalConnectorDiagnosticsPort } from './local-connector-diagnostics-port.js';
import { LocalReportGenerationPort } from './local-report-generation-port.js';
import { McpReportGenerationPort } from './mcp-report-generation-port.js';
import { AgentService } from './services/agent-service.js';
import { CandidateService } from './services/candidate-service.js';
import { DiagnosticsService } from './services/diagnostics-service.js';
import { EventService } from './services/event-service.js';
import { EvidenceService } from './services/evidence-service.js';
import { ProjectService } from './services/project-service.js';
import { ReportService } from './services/report-service.js';
import { RunService } from './services/run-service.js';
import { ScientificWorkflowService } from './scientific-workflow-service.js';

export interface CapabilityOverrides {
  workflow?: WorkflowExecutionPort;
  reports?: ReportGenerationPort;
  connectors?: ConnectorDiagnosticsPort;
}

export function createServices(
  client: DatabaseClient,
  environment: ApiEnvironment,
  overrides: CapabilityOverrides = {},
): RestApiServices {
  const repositories = createRepositories(client);
  const transactions = new PrismaTransactionManager(client);
  const artifactStore = new ArtifactStore(environment.ARTIFACT_ROOT);
  const notifier = new EventNotifier();
  const events = new EventService(repositories, notifier);
  const fixtureWorkflow = new InlineFixtureWorkflowPort(repositories, transactions);
  const mcpGateway = new HttpMcpToolGateway(
    environment.MCP_SERVER_URL ?? 'http://127.0.0.1:3001/mcp',
    environment.MCP_REQUEST_TIMEOUT_MS ?? 180_000,
  );
  const workflow =
    overrides.workflow ??
    new ScientificWorkflowService(
      repositories,
      transactions,
      mcpGateway,
      fixtureWorkflow,
      environment.DEMO_MODE,
    );
  return new ConcreteRestApiServices({
    projects: new ProjectService(repositories, transactions, artifactStore),
    runs: new RunService(repositories, transactions, events, workflow),
    events,
    candidates: new CandidateService(repositories),
    evidence: new EvidenceService(repositories),
    reports: new ReportService(
      repositories,
      (() => {
        if (overrides.reports !== undefined) return overrides.reports;
        const localReports = new LocalReportGenerationPort(repositories, artifactStore);
        return new McpReportGenerationPort(repositories, artifactStore, mcpGateway, localReports);
      })(),
      artifactStore,
    ),
    agents: new AgentService(mcpGateway),
    diagnostics: new DiagnosticsService(
      repositories.databaseHealth,
      overrides.connectors ?? new LocalConnectorDiagnosticsPort(),
      artifactStore,
      {
        demoMode: environment.DEMO_MODE,
        llmEnabled: environment.LLM_ENABLED,
        build: {
          applicationVersion: environment.APPLICATION_VERSION,
          specificationVersion: environment.SPECIFICATION_VERSION,
          commitSha: environment.COMMIT_SHA ?? null,
          builtAt: environment.BUILT_AT ?? null,
        },
      },
    ),
  });
}
