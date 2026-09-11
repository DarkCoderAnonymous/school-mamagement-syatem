import swaggerJsdoc from 'swagger-jsdoc';
import { env } from '../config/env';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'School Management System API',
      version: '0.1.0',
      description: 'Slice 1: school registration, approval, and auth.',
    },
    servers: [{ url: `http://localhost:${env.PORT}/api/v1` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  apis: ['src/modules/**/*.routes.ts', 'dist/modules/**/*.routes.js'],
});
