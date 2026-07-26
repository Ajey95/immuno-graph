import { McpApp, Module, ConfigModule } from '@nitrostack/core';

import { ChemistryModule } from './modules/chemistry/chemistry.module.js';
import { ConstraintModule } from './modules/constraint/constraint.module.js';
import { DockingModule } from './modules/docking/docking.module.js';
import { EvidenceModule } from './modules/evidence/evidence.module.js';
import { CloudHealthRoute } from './modules/config/cloud-health-route.js';
import { PredictionModule } from './modules/prediction/prediction.module.js';
import { ReportModule } from './modules/report/report.module.js';
import { StructureModule } from './modules/structure/structure.module.js';
import { SystemHealthCheck } from './health/system.health.js';

@McpApp({
  module: AppModule,
  server: {
    name: 'immunograph-mcp',
    version: '1.0.0',
  },
  logging: {
    level: 'info',
  },
})
@Module({
  name: 'app',
  description: 'ImmunoGraph NitroCloud MCP application',
  imports: [
    ConfigModule.forRoot(),
    PredictionModule,
    EvidenceModule,
    ConstraintModule,
    StructureModule,
    ChemistryModule,
    DockingModule,
    ReportModule,
  ],
  providers: [
    SystemHealthCheck,
    CloudHealthRoute,
    {
      provide: 'OAUTH_CONFIG',
      useValue: {
        resourceUri: 'http://localhost:3000',
        authorizationServers: ['https://auth.example.com'],
        required: false,
      },
    },
  ],
})
export class AppModule {}
