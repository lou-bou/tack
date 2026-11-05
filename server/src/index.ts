import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startScheduler } from './scheduler.js';

const config = loadConfig();
const app = await buildApp(config, { logger: true });
startScheduler(app);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.host, port: config.port });
