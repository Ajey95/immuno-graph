import { timingSafeEqual } from 'node:crypto';
import { createServer as createNodeServer } from 'node:http';

import { createMcpHandler } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';

import { createServer } from './server.js';

export interface HttpSettings {
  host: string;
  port: number;
  apiKey?: string;
  allowedHosts: string[];
  allowedOrigins: string[];
}

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

function names(value: string | undefined, fallback: string[]): string[] {
  return value?.split(',').map((name) => name.trim()).filter(Boolean) ?? fallback;
}

export function settingsFromEnvironment(env: NodeJS.ProcessEnv = process.env): HttpSettings {
  const host = env.HOST ?? '127.0.0.1';
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const local = LOOPBACK.includes(host);
  const apiKey = env.IMMUNOGRAPH_API_KEY;
  const allowedHosts = names(env.IMMUNOGRAPH_ALLOWED_HOSTS, LOOPBACK);
  const allowedOrigins = names(env.IMMUNOGRAPH_ALLOWED_ORIGINS, LOOPBACK);
  if (!local && (!apiKey || !env.IMMUNOGRAPH_ALLOWED_HOSTS || !env.IMMUNOGRAPH_ALLOWED_ORIGINS)) {
    throw new Error('Remote HTTP requires IMMUNOGRAPH_API_KEY and exact allowed hosts and origins');
  }
  if (apiKey !== undefined && apiKey.length < 24) throw new Error('IMMUNOGRAPH_API_KEY must have at least 24 characters');
  return { host, port, apiKey, allowedHosts, allowedOrigins };
}

function authorized(header: string | undefined, apiKey: string | undefined): boolean {
  if (!apiKey) return true;
  if (!header?.startsWith('Bearer ')) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(apiKey);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createHttpServer(settings: HttpSettings) {
  const handler = createMcpHandler(createServer, { responseMode: 'json' });
  const nodeHandler = toNodeHandler(handler);
  const checkHost = hostHeaderValidation(settings.allowedHosts);
  const checkOrigin = originValidation(settings.allowedOrigins);
  const server = createNodeServer((request, response) => {
    if (!checkHost(request, response) || !checkOrigin(request, response)) return;
    const pathname = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname;
    if (pathname === '/health' && request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', server: 'immunograph-mcp' }));
      return;
    }
    if (pathname !== '/mcp') {
      response.writeHead(404).end();
      return;
    }
    if (!authorized(request.headers.authorization, settings.apiKey)) {
      response.writeHead(401, { 'www-authenticate': 'Bearer', 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    void nodeHandler(request, response);
  });
  return { server, handler };
}
