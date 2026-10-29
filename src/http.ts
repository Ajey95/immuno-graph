import 'dotenv/config';

import { createHttpServer, settingsFromEnvironment } from './http-server.js';

const settings = settingsFromEnvironment();
const { server, handler } = createHttpServer(settings);
server.listen(settings.port, settings.host, () => {
  console.error(`ImmunoGraph MCP HTTP listening on ${settings.host}:${settings.port}`);
});

async function shutdown(): Promise<void> {
  await handler.close();
  server.close();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
