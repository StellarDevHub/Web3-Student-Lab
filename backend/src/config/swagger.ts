import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Web3 Student Lab API Documentation',
      version: '1.0.0',
      description:
        'API documentation for the Web3 Student Lab platform — a decentralized learning platform built on Stellar. ' +
        'This specification covers authentication (Web2 + Web3/Stellar), learning courses, certificates (NFT minting & verification), ' +
        'health monitoring, metrics, and more.',
      contact: {
        name: 'API Support',
        url: 'https://github.com/Web3-Student-Lab/Web3-Student-Lab',
        email: 'support@web3studentlab.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    externalDocs: {
      description: 'Project Repository',
      url: 'https://github.com/Web3-Student-Lab/Web3-Student-Lab',
    },
    servers: [
      {
        url: 'http://localhost:8080',
        description: 'Development server',
      },
      {
        url: 'https://api.web3studentlab.com',
        description: 'Production server',
      },
    ],
    tags: [
      { name: 'System', description: 'Health checks and system status' },
      { name: 'Health', description: 'Health endpoints for monitoring' },
      { name: 'Auth', description: 'Authentication and authorization' },
      { name: 'Learning', description: 'Course and curriculum management' },
      { name: 'Certificates', description: 'Certificate minting, verification, and management' },
      { name: 'Metrics', description: 'Application performance and business metrics' },
      { name: 'Licenses', description: 'Open source license guide' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token obtained via /api/v1/auth/login or /api/v1/auth/verify',
        },
        metricsToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Metrics-Token',
          description: 'Shared secret for operational metrics endpoints (METRICS_AUTH_TOKEN).',
        },
      },
      schemas: {
        ApiFieldError: {
          type: 'object',
          description: 'A single rejected field. Never contains the submitted value.',
          required: ['field', 'message'],
          properties: {
            field: {
              type: 'string',
              description: 'Dot-separated path of the invalid field.',
              example: 'tokenId',
            },
            message: {
              type: 'string',
              description: 'Reason the field was rejected.',
              example: 'tokenId must be alphanumeric',
            },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          description:
            'Single error envelope used by every handled error response. `message` is always safe for clients; full detail is logged server-side against `requestId`.',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['version', 'code', 'message', 'requestId', 'timestamp'],
              properties: {
                version: {
                  type: 'string',
                  description: 'Envelope schema version. Bumped only on breaking changes.',
                  example: '1',
                },
                code: {
                  type: 'string',
                  description: 'Stable machine-readable error code. Branch on this, not on text.',
                  enum: [
                    'BAD_REQUEST',
                    'VALIDATION_FAILED',
                    'UNAUTHORIZED',
                    'FORBIDDEN',
                    'NOT_FOUND',
                    'CONFLICT',
                    'UNPROCESSABLE_ENTITY',
                    'RATE_LIMITED',
                    'INTERNAL_ERROR',
                    'SERVICE_UNAVAILABLE',
                  ],
                  example: 'VALIDATION_FAILED',
                },
                message: {
                  type: 'string',
                  description:
                    'Client-safe description. Server faults collapse to a generic sentence; stack traces are never included.',
                  example: 'Request validation failed',
                },
                requestId: {
                  type: 'string',
                  description:
                    'Correlation ID for this request; also returned as the X-Correlation-ID response header. Quote it in support requests.',
                  example: '9f1c2e3a-6b74-4c0f-9a5c-7b1d2e3f4a5b',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
                fieldErrors: {
                  type: 'array',
                  description: 'Present on validation failures only.',
                  items: { $ref: '#/components/schemas/ApiFieldError' },
                },
              },
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: 'Malformed request.',
          headers: {
            'X-Correlation-ID': {
              description: 'Correlation ID matching error.requestId.',
              schema: { type: 'string' },
            },
          },
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
          },
        },
        ValidationError: {
          description: 'Request validation failed — see error.fieldErrors.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid credentials.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
          },
        },
        Forbidden: {
          description: 'Authenticated but not permitted.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
          },
        },
        NotFound: {
          description: 'Resource not found.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
          },
        },
        RateLimited: {
          description: 'Rate limit exceeded.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
          },
        },
        InternalError: {
          description: 'Unexpected server error. Detail is logged against error.requestId.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
          },
        },
      },
    },
  },
  apis: [
    './src/index.ts',
    './src/routes/*.ts',
    './src/routes/**/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
