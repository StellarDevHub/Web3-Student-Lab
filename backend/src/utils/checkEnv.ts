import logger from './logger.js';

/**
 * Environment Variable Validation Utility
 * Ensures all required environment variables are present before application startup
 */

/**
 * Environment variable configuration interface
 */
interface EnvVarConfig {
  name: string;
  required: boolean;
  productionOnly?: boolean;
  description: string;
  validator?: (value: string) => boolean;
}

/**
 * Critical environment variables required in all environments
 */
const REQUIRED_VARS: EnvVarConfig[] = [
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL connection string for database connectivity',
    validator: (value: string) => {
      // Basic validation for PostgreSQL connection string format
      return value.startsWith('postgresql://') || value.startsWith('postgres://');
    },
  },
  {
    name: 'JWT_SECRET',
    required: true,
    description: 'Secret key for JWT token signing and verification',
    validator: (value: string) => {
      // JWT secret should be at least 32 characters for security
      return value.length >= 32 && value !== 'your-secret-key-change-in-production';
    },
  },
  {
    name: 'REDIS_URL',
    required: true,
    description: 'Redis connection URL for background jobs and WebSockets',
    validator: (value: string) => {
      return value.startsWith('redis://') || value.startsWith('rediss://');
    },
  },
];

/**
 * Environment variables required only in production
 */
const PRODUCTION_REQUIRED_VARS: EnvVarConfig[] = [
  {
    name: 'STELLAR_ISSUER_SECRET_KEY',
    required: true,
    productionOnly: true,
    description: 'Stellar secret key for certificate issuance (production only)',
  },
  {
    name: 'STELLAR_ISSUER_PUBLIC_KEY',
    required: true,
    productionOnly: true,
    description: 'Stellar public key for certificate issuance (production only)',
  },
];

/**
 * Optional environment variables with defaults
 */
const OPTIONAL_VARS: Record<string, { defaultValue: string; description: string }> = {
  PORT: {
    defaultValue: '8080',
    description: 'Port number for the backend server',
  },
  NODE_ENV: {
    defaultValue: 'development',
    description: 'Application environment (development, production, test)',
  },
  JWT_EXPIRES_IN: {
    defaultValue: '7d',
    description: 'JWT token expiration time',
  },
  STELLAR_NETWORK: {
    defaultValue: 'testnet',
    description: 'Stellar network to connect to (testnet, mainnet, futurenet)',
  },
  STELLAR_HORIZON_URL: {
    defaultValue: 'https://horizon-testnet.stellar.org',
    description: 'Stellar Horizon server URL',
  },
  SOROBAN_RPC_URL: {
    defaultValue: 'https://soroban-testnet.stellar.org',
    description: 'Soroban RPC URL for smart contract interactions',
  },
  CERTIFICATE_CONTRACT_ID: {
    defaultValue: '',
    description: 'Deployed Soroban certificate contract ID',
  },
  CERTIFICATE_VALIDITY_DAYS: {
    defaultValue: '365',
    description: 'Default certificate validity period in days',
  },
  LOG_LEVEL: {
    defaultValue: 'info',
    description: 'Logging level (debug, info, warn, error)',
  },
  OPENAI_API_KEY: {
    defaultValue: '',
    description: 'OpenAI API key for project idea generation (optional)',
  },
};

/**
 * Custom error class for environment variable validation
 */
export class EnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentValidationError';
  }
}

/**
 * Validates a single environment variable
 */
function validateVariable(config: EnvVarConfig): void {
  const value = process.env[config.name];

  // Check if variable is missing
  if (!value || value.trim() === '') {
    throw new EnvironmentValidationError(
      `Missing required environment variable: ${config.name}\n` +
        `Description: ${config.description}\n` +
        `Please check your .env file and .env.example for guidance.`
    );
  }

  // Run custom validator if provided
  if (config.validator && !config.validator(value)) {
    throw new EnvironmentValidationError(
      `Invalid value for environment variable: ${config.name}\n` +
        `Description: ${config.description}\n` +
        `Current value: "${value}"\n` +
        `Please check .env.example for the correct format.`
    );
  }
}

/**
 * Validates all required environment variables
 */
export function validateEnvironment(): void {
  const errors: string[] = [];

  try {
    // Validate critical required variables
    for (const config of REQUIRED_VARS) {
      try {
        validateVariable(config);
      } catch (error) {
        if (error instanceof EnvironmentValidationError) {
          errors.push(error.message);
        }
      }
    }

    // Validate production-only variables if in production
    if (process.env.NODE_ENV === 'production') {
      for (const config of PRODUCTION_REQUIRED_VARS) {
        try {
          validateVariable(config);
        } catch (error) {
          if (error instanceof EnvironmentValidationError) {
            errors.push(error.message);
          }
        }
      }
    }

    // If there are validation errors, throw a comprehensive error
    if (errors.length > 0) {
      throw new EnvironmentValidationError(
        `Environment validation failed:\n\n${errors.join('\n\n')}\n\n` +
          `Please copy .env.example to .env and fill in the required values.`
      );
    }

    // Set defaults for optional variables
    for (const [name, config] of Object.entries(OPTIONAL_VARS)) {
      if (!process.env[name] || process.env[name]!.trim() === '') {
        if (config.defaultValue !== '') {
          process.env[name] = config.defaultValue;
        }
      }
    }

    logger.info('✅ Environment variables validated successfully');

    // Log environment info (without sensitive data)
    logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🔌 Port: ${process.env.PORT}`);
    logger.info(`🌐 Stellar Network: ${process.env.STELLAR_NETWORK}`);
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      logger.error(`❌ Environment Configuration Error: ${error.message}`);
      // Always throw the error - let the caller decide what to do
      throw error;
    } else {
      logger.error(`❌ Unexpected error during environment validation: ${error}`);
      // Only exit if we're not in a test environment
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Gets environment variable with type safety and default value
 */
export function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value && value.trim() !== '') {
    return value;
  }
  if (defaultValue) {
    return defaultValue;
  }
  throw new EnvironmentValidationError(`Environment variable ${name} is required`);
}

/**
 * Checks if we're in production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Checks if we're in development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Checks if we're in test environment
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}
