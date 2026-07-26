import 'dotenv/config';

import { McpApp, Module, OAuthModule } from '@nitrostack/core';

import { ConstraintModule } from './constraint/constraint.module.js';
import { EvidenceModule } from './evidence/evidence.module.js';
import { PredictionModule } from './prediction/prediction.module.js';
import { ReportModule } from './report/report.module.js';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const transportType = (process.env.MCP_TRANSPORT_TYPE ?? 'http') as 'stdio' | 'http' | 'dual';
const httpHost =
  process.env.HOST ?? process.env.MCP_HOST ?? (nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1');
const defaultHttpPort = nodeEnv === 'production' ? 3000 : 3001;
const httpPort = Number(process.env.PORT ?? process.env.MCP_PORT ?? defaultHttpPort);
const resourceUri =
  process.env.OAUTH_RESOURCE_URI ??
  process.env.RESOURCE_URI ??
  `http://${httpHost}:${httpPort}/mcp`;
const authorizationServer =
  process.env.OAUTH_AUTH_SERVER ?? process.env.AUTH_SERVER_URL ?? new URL(resourceUri).origin;

@McpApp({
  module: AppModule,
  server: {
    name: 'immunograph-mcp',
    version: '0.1.0',
  },
  transport: {
    type: transportType,
    http: {
      host: httpHost,
      port: httpPort,
      basePath: '/mcp',
    },
  },
})
@Module({
  name: 'immunograph',
  imports: [
    OAuthModule.forRoot({
      resourceUri,
      authorizationServers: [authorizationServer],
      scopesSupported: ['mcp:read', 'mcp:write', 'tools:execute'],
      required: process.env.OAUTH_REQUIRED === 'true',
      http: {
        host: httpHost,
        port: httpPort,
        basePath: '/mcp',
      },
    }),
    PredictionModule,
    EvidenceModule,
    ConstraintModule,
    ReportModule,
  ],
})
export class AppModule {}
