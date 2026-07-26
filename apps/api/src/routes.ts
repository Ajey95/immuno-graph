import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import type { z } from 'zod';

import * as contracts from './contracts.js';
import { IdempotencyCoordinator, parseWith, requestId } from './http.js';
import type { ApiOperation, RestApiServices } from './services.js';

interface JsonRoute {
  method: HTTPMethods;
  url: string;
  operation: ApiOperation;
  statusCode: number;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  idempotent?: boolean;
  naturalIdempotencyField?: string;
}

const routes: JsonRoute[] = [
  {
    method: 'POST',
    url: '/projects',
    operation: 'projects.create',
    statusCode: 201,
    body: contracts.projectCreate,
    idempotent: true,
  },
  {
    method: 'GET',
    url: '/projects',
    operation: 'projects.list',
    statusCode: 200,
    query: contracts.pagination,
  },
  {
    method: 'GET',
    url: '/projects/:projectId',
    operation: 'projects.get',
    statusCode: 200,
    params: contracts.idParams('projectId'),
  },
  {
    method: 'DELETE',
    url: '/projects/:projectId',
    operation: 'projects.delete',
    statusCode: 200,
    params: contracts.idParams('projectId'),
    body: contracts.projectDelete,
    idempotent: true,
  },
  {
    method: 'POST',
    url: '/projects/:projectId/runs',
    operation: 'runs.create',
    statusCode: 201,
    params: contracts.idParams('projectId'),
    body: contracts.runCreate,
    idempotent: true,
  },
  {
    method: 'GET',
    url: '/runs/:runId',
    operation: 'runs.get',
    statusCode: 200,
    params: contracts.runParams,
  },
  {
    method: 'POST',
    url: '/runs/:runId/approvals/configuration',
    operation: 'runs.approveConfiguration',
    statusCode: 200,
    params: contracts.runParams,
    body: contracts.configurationApproval,
    idempotent: true,
  },
  {
    method: 'POST',
    url: '/runs/:runId/start',
    operation: 'runs.start',
    statusCode: 202,
    params: contracts.runParams,
    body: contracts.empty,
    idempotent: true,
    naturalIdempotencyField: 'runId',
  },
  {
    method: 'POST',
    url: '/runs/:runId/cancel',
    operation: 'runs.cancel',
    statusCode: 202,
    params: contracts.runParams,
    body: contracts.empty,
    idempotent: true,
  },
  {
    method: 'POST',
    url: '/runs/:runId/stages/:stageKey/retry',
    operation: 'runs.retryStage',
    statusCode: 202,
    params: contracts.retryParams,
    body: contracts.retryBody,
    idempotent: true,
  },
  {
    method: 'GET',
    url: '/runs/:runId/events/history',
    operation: 'events.history',
    statusCode: 200,
    params: contracts.runParams,
    query: contracts.eventHistoryQuery,
  },
  {
    method: 'GET',
    url: '/runs/:runId/candidates',
    operation: 'candidates.list',
    statusCode: 200,
    params: contracts.runParams,
    query: contracts.candidateListQuery,
  },
  {
    method: 'GET',
    url: '/runs/:runId/candidates/:candidateId',
    operation: 'candidates.get',
    statusCode: 200,
    params: contracts.candidateParams,
  },
  {
    method: 'POST',
    url: '/runs/:runId/candidates/compare',
    operation: 'candidates.compare',
    statusCode: 200,
    params: contracts.runParams,
    body: contracts.compareCandidates,
    idempotent: true,
  },
  {
    method: 'GET',
    url: '/runs/:runId/population-coverage',
    operation: 'coverage.get',
    statusCode: 200,
    params: contracts.runParams,
    query: contracts.coverageQuery,
  },
  {
    method: 'GET',
    url: '/runs/:runId/shortlist-optimization',
    operation: 'coverage.getShortlistOptimization',
    statusCode: 200,
    params: contracts.runParams,
    query: contracts.shortlistOptimizationQuery,
  },
  {
    method: 'POST',
    url: '/runs/:runId/approvals/shortlist',
    operation: 'runs.approveShortlist',
    statusCode: 200,
    params: contracts.runParams,
    body: contracts.shortlistApproval,
    idempotent: true,
  },
  {
    method: 'GET',
    url: '/runs/:runId/evidence-graph',
    operation: 'graphs.evidence',
    statusCode: 200,
    params: contracts.runParams,
    query: contracts.evidenceGraphQuery,
  },
  {
    method: 'GET',
    url: '/runs/:runId/workflow-graph',
    operation: 'graphs.workflow',
    statusCode: 200,
    params: contracts.runParams,
  },
  {
    method: 'GET',
    url: '/runs/:runId/visualizations/:type',
    operation: 'visualizations.get',
    statusCode: 200,
    params: contracts.visualizationParams,
  },
  { method: 'GET', url: '/connectors', operation: 'connectors.list', statusCode: 200 },
  { method: 'GET', url: '/connectors/health', operation: 'connectors.health', statusCode: 200 },
  {
    method: 'POST',
    url: '/runs/:runId/candidates/:candidateId/explanation',
    operation: 'explanations.generate',
    statusCode: 200,
    params: contracts.candidateParams,
    body: contracts.explanationBody,
    idempotent: true,
  },
  {
    method: 'POST',
    url: '/runs/:runId/reports',
    operation: 'reports.create',
    statusCode: 202,
    params: contracts.runParams,
    body: contracts.reportBody,
    idempotent: true,
  },
  {
    method: 'GET',
    url: '/runs/:runId/artifacts',
    operation: 'artifacts.list',
    statusCode: 200,
    params: contracts.runParams,
  },
  {
    method: 'POST',
    url: '/runs/:runId/agent-workflow',
    operation: 'agents.runWorkflow',
    statusCode: 202,
    params: contracts.runParams,
    body: contracts.agentWorkflowBody,
    idempotent: true,
  },
  {
    method: 'POST',
    url: '/runs/:runId/chat',
    operation: 'agents.chat',
    statusCode: 200,
    params: contracts.runParams,
    body: contracts.agentChatBody,
    idempotent: true,
  },
  { method: 'GET', url: '/settings/profiles', operation: 'settings.profiles', statusCode: 200 },
  { method: 'GET', url: '/settings/runtime', operation: 'settings.runtime', statusCode: 200 },
];

function parsedInput(route: JsonRoute, request: FastifyRequest): Record<string, unknown> {
  const params = route.params === undefined ? {} : parseWith(route.params, request.params);
  const query = route.query === undefined ? {} : parseWith(route.query, request.query);
  const body = route.body === undefined ? {} : parseWith(route.body, request.body ?? {});
  return {
    ...(params as Record<string, unknown>),
    ...(query as Record<string, unknown>),
    ...(body as Record<string, unknown>),
  };
}

function idempotencyKey(request: FastifyRequest): string | undefined {
  const headers = parseWith(contracts.idempotencyHeaders, request.headers);
  return headers['idempotency-key'];
}

function safeDownloadFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'artifact';
}

async function sendSse(
  request: FastifyRequest,
  reply: FastifyReply,
  services: RestApiServices,
): Promise<void> {
  const { runId } = parseWith(contracts.runParams, request.params);
  const lastEventIdHeader = request.headers['last-event-id'];
  const lastEventId = Array.isArray(lastEventIdHeader) ? lastEventIdHeader[0] : lastEventIdHeader;
  const context = { requestId: requestId(request) };
  const disconnect = new AbortController();
  const abort = () => disconnect.abort();
  request.raw.once('close', abort);
  const events = services.streamRunEvents(
    {
      runId,
      ...(lastEventId === undefined ? {} : { lastEventId }),
      signal: disconnect.signal,
    },
    context,
  );
  reply.hijack();
  reply.raw.statusCode = 200;
  reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
  reply.raw.setHeader('Connection', 'keep-alive');
  const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15_000);
  heartbeat.unref();
  try {
    for await (const event of events) {
      reply.raw.write(`id: ${event.id}\n`);
      reply.raw.write(`event: ${event.event}\n`);
      reply.raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
    }
  } finally {
    clearInterval(heartbeat);
    request.raw.off('close', abort);
    disconnect.abort();
    reply.raw.end();
  }
}

export async function registerApiRoutes(
  application: FastifyInstance,
  services: RestApiServices,
): Promise<void> {
  const idempotency = new IdempotencyCoordinator();
  await application.register(
    async (api) => {
      for (const route of routes) {
        api.route({
          method: route.method,
          url: route.url,
          handler: async (request, reply) => {
            const input = parsedInput(route, request);
            const suppliedKey = route.idempotent === true ? idempotencyKey(request) : undefined;
            const naturalKey =
              route.naturalIdempotencyField === undefined
                ? undefined
                : String(input[route.naturalIdempotencyField]);
            const key = suppliedKey ?? naturalKey;
            const context = {
              requestId: requestId(request),
              ...(key === undefined ? {} : { idempotencyKey: key }),
            };
            const data = await idempotency.execute(route.operation, key, input, () =>
              services.execute(route.operation, input, context),
            );
            request.log.info(
              {
                operation: route.operation,
                statusCode: route.statusCode,
                idempotentReplayKey: key,
              },
              'api.operation.completed',
            );
            return reply.status(route.statusCode).send({ requestId: requestId(request), data });
          },
        });
      }

      api.get('/runs/:runId/events', async (request, reply) => {
        await sendSse(request, reply, services);
      });

      api.get('/artifacts/:artifactId/download', async (request, reply) => {
        const { artifactId } = parseWith(contracts.idParams('artifactId'), request.params) as {
          artifactId: string;
        };
        const artifact = await services.downloadArtifact(
          { artifactId },
          { requestId: requestId(request) },
        );
        const filename = safeDownloadFilename(artifact.filename);
        reply.type(artifact.mediaType);
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
        reply.header('X-Content-Type-Options', 'nosniff');
        if (artifact.contentLength !== undefined) {
          reply.header('Content-Length', artifact.contentLength);
        }
        return reply.send(artifact.stream);
      });
    },
    { prefix: '/api/v1' },
  );
}
