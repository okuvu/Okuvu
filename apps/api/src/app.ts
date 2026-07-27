import Fastify from 'fastify';
import { errorHandler } from './errors/handler.js';
import { registerRoutes } from './routes/index.js';
import { validateCloudTasksConfig } from './lib/summary-enqueue.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  const missingCloudTasks = validateCloudTasksConfig();
  if (missingCloudTasks.length > 0) {
    app.log.warn({ event: 'config_validation', missing_vars: missingCloudTasks }, 'Cloud Tasks is not fully configured — summary enqueue will be skipped');
  }

  app.setErrorHandler(errorHandler);

  app.register(registerRoutes);

  return app;
}
