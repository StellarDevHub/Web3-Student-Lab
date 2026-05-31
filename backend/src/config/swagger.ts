import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Web3 Student Lab API Documentation',
      version: '1.0.0',
      description: 'API documentation for the Web3 Student Lab platform',
      contact: {
        name: 'API Support',
        url: 'https://github.com/ekelemepraise-code/Web3-Student-Lab',
      },
    },
    servers: [
      {
        url: 'http://localhost:8080',
        description: 'Development server',
      },
      {
        url: 'https://api.web3studentlab.com', // Example production URL
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/routes/**/*.ts',
    './src/controllers/*.ts',
    './src/controllers/**/*.ts',
  ], // Path to the API docs
};

export const swaggerSpec = swaggerJsdoc(options);
