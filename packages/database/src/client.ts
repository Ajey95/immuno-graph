import { createRequire } from 'node:module';

import type { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);

export type DatabaseClient = PrismaClient;

export function createDatabaseClient(databaseUrl?: string): PrismaClient {
  const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');

  return new PrismaClient(
    databaseUrl === undefined ? undefined : { datasources: { db: { url: databaseUrl } } },
  );
}

export async function initializeDatabase(client: PrismaClient): Promise<void> {
  await client.$connect();
  await client.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await client.$queryRawUnsafe('PRAGMA journal_mode = WAL');
}
