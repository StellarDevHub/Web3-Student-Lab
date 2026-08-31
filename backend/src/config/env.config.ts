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
    url: getEnvVar('DATABASE_URL'),
    readReplicaUrl: getEnvVar('DATABASE_READ_REPLICA_URL', ''),
    replica: {
      checkIntervalMs: parseInt(getEnvVar('DB_REPLICA_CHECK_INTERVAL_MS', '10000'), 10),
      failureThreshold: parseInt(getEnvVar('DB_REPLICA_FAILURE_THRESHOLD', '3'), 10),
      cooldownMs: parseInt(getEnvVar('DB_REPLICA_COOLDOWN_MS', '30000'), 10),
      replicationLagWindowMs: parseInt(getEnvVar('DB_REPLICATION_LAG_WINDOW_MS', '1000'), 10),
    },
  },
  redis: {
    url: getEnvVar('REDIS_URL'), // Required
  },
  security: {
    jwtSecret: getEnvVar('JWT_SECRET'), // Required
    jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', '7d'),
  },

  /**
   * Payload encryption key rotation configuration.
   *
   * Keys are loaded dynamically from PAYLOAD_ENCRYPTION_KEY_v<N> env vars by
   * EncryptionKeyManager rather than being read here, so this section only
   * holds rotation-related tunables that benefit from centralised config access.
   */
  encryption: {
    /**
     * Comma-separated list of field paths that are encrypted at rest.
     * Informational — used by the rotation CLI / admin endpoint to know
     * which Prisma fields to iterate when migrating ciphertexts.
     * Example: "Student.githubAccessToken,WebhookSubscription.secret"
     */
    encryptedFields: process.env.ENCRYPTED_FIELDS || '',

    /**
     * Maximum number of rows to re-encrypt per rotation batch request.
     * Prevents a single HTTP call from running for too long.
     */
    rotationBatchSize: parseInt(process.env.ENCRYPTION_ROTATION_BATCH_SIZE || '100', 10),

    /**
     * If true, the GET /api/v1/security/key-versions endpoint is enabled.
     * Keep disabled in production unless accessed through an admin-only gateway.
     */
    exposeKeyVersionEndpoint: process.env.ENCRYPTION_EXPOSE_KEY_VERSIONS !== 'false',
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
  rateLimiting: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    defaultBurstMax: parseInt(getEnvVar('RATE_LIMIT_BURST_MAX', '20'), 10),
    defaultBurstWindowMs: parseInt(getEnvVar('RATE_LIMIT_BURST_WINDOW_MS', '1000'), 10),
    defaultSustainedMax: parseInt(getEnvVar('RATE_LIMIT_SUSTAINED_MAX', '200'), 10),
    defaultSustainedWindowMs: parseInt(getEnvVar('RATE_LIMIT_SUSTAINED_WINDOW_MS', '60000'), 10),
    authBurstMax: parseInt(getEnvVar('RATE_LIMIT_AUTH_BURST_MAX', '80'), 10),
    authSustainedMax: parseInt(getEnvVar('RATE_LIMIT_AUTH_SUSTAINED_MAX', '600'), 10),
    adminBurstMax: parseInt(getEnvVar('RATE_LIMIT_ADMIN_BURST_MAX', '200'), 10),
    adminSustainedMax: parseInt(getEnvVar('RATE_LIMIT_ADMIN_SUSTAINED_MAX', '2000'), 10),
    loginBurstMax: parseInt(getEnvVar('RATE_LIMIT_LOGIN_BURST_MAX', '5'), 10),
    registerBurstMax: parseInt(getEnvVar('RATE_LIMIT_REGISTER_BURST_MAX', '3'), 10),
    quizSubmissionBurstMax: parseInt(getEnvVar('RATE_LIMIT_QUIZ_BURST_MAX', '10'), 10),
    playgroundCompileBurstMax: parseInt(getEnvVar('RATE_LIMIT_PLAYGROUND_BURST_MAX', '5'), 10),
  },
  backup: {
    s3: {
      region: getEnvVar('BACKUP_S3_REGION', 'us-east-1'),
      bucket: getEnvVar('BACKUP_S3_BUCKET', ''),
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY || '',
      endpoint: process.env.BACKUP_S3_ENDPOINT || '',
    },
    cronSchedule: getEnvVar('BACKUP_CRON_SCHEDULE', '0 2 * * *'),
    retentionDays: parseInt(getEnvVar('BACKUP_RETENTION_DAYS', '30'), 10),
    compress: process.env.BACKUP_COMPRESS !== 'false',
    tempDir: getEnvVar('BACKUP_TEMP_DIR', '/tmp/backups'),
  },
  graphql: {
    maxDepth: parseInt(getEnvVar('GRAPHQL_MAX_DEPTH', '10'), 10),
    maxComplexity: parseInt(getEnvVar('GRAPHQL_MAX_COMPLEXITY', '100'), 10),
  },

  /**
   * Helper to safely log configuration without exposing secrets
   */
  getSafeConfig() {
    return {
      app: this.app,
      graphql: this.graphql,
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
      },
      encryption: {
        encryptedFields: this.encryption.encryptedFields,
        rotationBatchSize: this.encryption.rotationBatchSize,
        exposeKeyVersionEndpoint: this.encryption.exposeKeyVersionEndpoint,
        // Key material is never stored in config — it lives in PAYLOAD_ENCRYPTION_KEY_v<N> env vars
      },
      backup: {
        s3: {
          region: this.backup.s3.region,
          bucket: this.maskSecret(this.backup.s3.bucket),
          accessKeyId: this.backup.s3.accessKeyId ? '***REDACTED***' : '',
          secretAccessKey: this.backup.s3.secretAccessKey ? '***REDACTED***' : '',
          endpoint: this.backup.s3.endpoint || '',
        },
        cronSchedule: this.backup.cronSchedule,
        retentionDays: this.backup.retentionDays,
        compress: this.backup.compress,
        tempDir: this.backup.tempDir,
      },
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
