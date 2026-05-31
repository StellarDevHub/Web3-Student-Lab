import dotenv from 'dotenv';
import path from 'path';
import { getEnvVar, validateEnvironment } from '../utils/checkEnv.js';
import logger from '../utils/logger.js';

// Determine which environment file to load based on NODE_ENV
const environment = process.env.NODE_ENV || 'development';
const envFile = environment === 'test' ? '.env.test' : '.env';

// Load the appropriate .env file
const result = dotenv.config({ path: path.resolve(process.cwd(), envFile) });

if (result.error && environment !== 'production') {
  logger.warn(`Failed to load ${envFile} file, using environment variables from system.`);
}

// Validate environment variables using the existing checkEnv utility
// We only run this if not in test to avoid throwing during unit tests setup if missing vars
if (environment !== 'test') {
  validateEnvironment();
}

/**
 * Centralized configuration object for the entire application.
 * All environment variables should be accessed through this object.
 * Secure secrets are masked in logging and handling functions are provided.
 */
export const config = {
  app: {
    env: environment,
    port: parseInt(getEnvVar('PORT', '8080'), 10),
    logLevel: getEnvVar('LOG_LEVEL', 'info'),
  },
  db: {
    url: getEnvVar('DATABASE_URL'), // Required
  },
  redis: {
    url: getEnvVar('REDIS_URL', 'redis://localhost:6379'),
  },
  security: {
    jwtSecret: getEnvVar('JWT_SECRET'), // Required
    jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', '7d'),
  },
  stellar: {
    network: getEnvVar('STELLAR_NETWORK', 'testnet'),
    horizonUrl: getEnvVar('STELLAR_HORIZON_URL', 'https://horizon-testnet.stellar.org'),
    rpcUrl: getEnvVar('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org'),
    issuerPublicKey: process.env.STELLAR_ISSUER_PUBLIC_KEY || '',
    issuerSecretKey: process.env.STELLAR_ISSUER_SECRET_KEY || '',
    certificateContractId: process.env.CERTIFICATE_CONTRACT_ID || '',
    certificateValidityDays: parseInt(getEnvVar('CERTIFICATE_VALIDITY_DAYS', '365'), 10),
    issuerName: process.env.ISSUER_NAME || 'Web3 Student Lab',
    issuerDid: process.env.ISSUER_DID || 'did:stellar:GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  
  /**
   * Helper to safely log configuration without exposing secrets
   */
  getSafeConfig() {
    return {
      app: this.app,
      redis: { url: this.maskSecret(this.redis.url) },
      db: { url: this.maskSecret(this.db.url) },
      security: {
        jwtSecret: '***REDACTED***',
        jwtExpiresIn: this.security.jwtExpiresIn,
      },
      stellar: {
        ...this.stellar,
        issuerSecretKey: this.stellar.issuerSecretKey ? '***REDACTED***' : '',
      },
      openai: {
        apiKey: this.openai.apiKey ? '***REDACTED***' : '',
      }
    };
  },

  /**
   * Helper to mask a secret string (shows only first and last 3 characters)
   */
  maskSecret(secret: string): string {
    if (!secret) return '';
    if (secret.length <= 8) return '***REDACTED***';
    return `${secret.substring(0, 3)}...${secret.substring(secret.length - 3)}`;
  }
};

export default config;
