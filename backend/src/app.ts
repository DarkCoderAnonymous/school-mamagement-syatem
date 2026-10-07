import 'express-async-errors';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { swaggerSpec } from './docs/swagger';
import { authRateLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import apiRouter from './routes/index';

export function createApp(): Express {
  const app = express();

  // Must match the real proxy chain in front of the API (env TRUST_PROXY,
  // default one hop). req.ip — and so every per-IP limit — depends on it.
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());

  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: allowedOrigins.includes('*') ? true : allowedOrigins,
      credentials: true,
    }),
  );

  app.use(express.json());
  app.use(cookieParser());
  app.use(mongoSanitize());
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.use('/api/v1/auth', authRateLimiter);
  app.use('/api/v1', apiRouter);

  // The full API map is a development aid, not something to publish.
  if (env.NODE_ENV !== 'production') {
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
