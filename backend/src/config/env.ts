const NODE_ENVS = ['development', 'test', 'production', 'staging'] as const;

export type EnvironmentConfig = {
  NODE_ENV: (typeof NODE_ENVS)[number];
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
};

export function validateEnvironment(): EnvironmentConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (!NODE_ENVS.includes(nodeEnv as EnvironmentConfig['NODE_ENV'])) {
    throw new Error(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('PostgreSQL connection string is required for persistence');
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('Cryptographic secret key for JWT authentication is required');
  }

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer');
  }

  return {
    NODE_ENV: nodeEnv as EnvironmentConfig['NODE_ENV'],
    PORT: port,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
  };
}
