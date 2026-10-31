import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { request } from 'node:http';

const cert = readFileSync(process.env.IMMUNOGRAPH_SMOKE_TLS_CERT);
const key = readFileSync(process.env.IMMUNOGRAPH_SMOKE_TLS_KEY);

createServer({ cert, key }, (incoming, outgoing) => {
  const upstream = request({
    hostname: '127.0.0.1',
    port: 3000,
    path: incoming.url,
    method: incoming.method,
    headers: { ...incoming.headers, host: 'localhost:3000' },
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', (error) => {
    outgoing.writeHead(502);
    outgoing.end(error.message);
  });
  incoming.pipe(upstream);
}).listen(3443, '127.0.0.1');
