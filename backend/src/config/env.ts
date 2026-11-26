const NODE_ENVS = ['development', 'test', 'production', 'staging'] as const;

const MIN_SECRET_LENGTH = 32;

const INSECURE_SECRET_PLACEHOLDERS = new Set([
  'your-secret-key-change-in-production',
  'your-secret-key',
  'secret',
  'changeme',
  'change-me',
  'change-me-in-production',
  'default',
  'placeholder',
  'replace-me',
  'replace-this-secret',
  'test-secret',
  'your-jwt-secret',
  'your-access-token-secret',
  'your-refresh-token-secret',
]);

export type EnvironmentConfig = {
  NODE_ENV: (typeof NODE_ENVS)[number];
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  ACCESS_TOKEN_SECRET?: string;
  REFRESH_TOKEN_SECRET?: string;
};

/**
 * Validates a named secret. Rejects missing values, values shorter than
 * MIN_SECRET_LENGTH, and known default placeholder strings (case-insensitive).
 */
export function assertSecureSecret(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required and must be set to a strong secret`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters long`);
  }
  if (INSECURE_SECRET_PLACEHOLDERS.has(value.trim().toLowerCase())) {
    throw new Error(`${name} matches a known insecure placeholder value and must be replaced`);
  }
  return value;
}

export function validateEnvironment(): EnvironmentConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (!NODE_ENVS.includes(nodeEnv as EnvironmentConfig['NODE_ENV'])) {
    throw new Error(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('PostgreSQL connection string is required for persistence');
  }

  const jwtSecret = assertSecureSecret('JWT_SECRET', process.env.JWT_SECRET);

  // Optional token secrets: validated whenever they are configured. When the
  // process uses them they must be strong; if unset they are not required here.
  const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
  const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;
  if (accessTokenSecret !== undefined) {
    assertSecureSecret('ACCESS_TOKEN_SECRET', accessTokenSecret);
  }
  if (refreshTokenSecret !== undefined) {
    assertSecureSecret('REFRESH_TOKEN_SECRET', refreshTokenSecret);
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
    ACCESS_TOKEN_SECRET: accessTokenSecret,
    REFRESH_TOKEN_SECRET: refreshTokenSecret,
  };
}

/**
 * Returns the validated JWT secret without exiting. Safe to call at module
 * load time: index.ts runs failFastOnInvalidEnvironment() before serving, and
 * this getter is only reached after that check has passed.
 */
export function getValidatedJwtSecret(): string {
  return assertSecureSecret('JWT_SECRET', process.env.JWT_SECRET);
}

/**
 * Runs environment validation at process startup. On failure, logs a fatal
 * error and exits the process with code 1 so the server never serves traffic
 * with an insecure configuration.
 */
export function failFastOnInvalidEnvironment(): EnvironmentConfig {
  try {
    return validateEnvironment();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FATAL: invalid environment configuration: ${message}`);
    process.exit(1);
  }
}
