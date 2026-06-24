import Fastify from 'fastify';
import { errorHandler } from './errors/handler.js';
import { registerRoutes } from './routes/index.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  app.setErrorHandler(errorHandler);

  app.register(registerRoutes);

  return app;
}
