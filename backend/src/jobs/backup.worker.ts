import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Job, Worker } from 'bullmq';
import { spawn } from 'child_process';
import { createReadStream, createWriteStream, mkdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import config from '../config/env.config.js';
import logger from '../utils/logger.js';
import { BACKUP_QUEUE_NAME, backupQueue } from './backup.queue.js';

interface BackupJobData {
  type: 'scheduled' | 'manual';
  description?: string;
}

interface BackupResult {
  key: string;
  bucket: string;
  region: string;
  sizeBytes: number;
  durationMs: number;
  timestamp: string;
}

function getS3Client(): S3Client | null {
  const { region, accessKeyId, secretAccessKey, endpoint } = config.backup.s3;
  if (!accessKeyId || !secretAccessKey || !config.backup.s3.bucket) {
    return null;
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

function parseDatabaseUrl(url: string): { host: string; port: number; user: string; password: string; database: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

async function runPgDump(): Promise<{ filePath: string; sizeBytes: number }> {
  const dbConfig = parseDatabaseUrl(config.db.url);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tempDir = config.backup.tempDir;
  mkdirSync(tempDir, { recursive: true });

  const fileName = `web3-student-lab-${timestamp}.sql${config.backup.compress ? '.gz' : ''}`;
  const filePath = join(tempDir, fileName);

  logger.info(`Starting pg_dump backup to ${filePath}`);

  const env = {
    ...process.env,
    PGHOST: dbConfig.host,
    PGPORT: String(dbConfig.port),
    PGUSER: dbConfig.user,
    PGPASSWORD: dbConfig.password,
    PGDATABASE: dbConfig.database,
  };

  if (config.backup.compress) {
    const dump = spawn('pg_dump', ['--no-owner', '--no-acl', '--format=custom'], { env });
    const compress = spawn('gzip', [], { stdio: ['pipe', 'pipe', 'inherit'] });
    const write = createWriteStream(filePath);

    dump.stdout.pipe(compress.stdin);
    compress.stdout.pipe(write);

    await new Promise<void>((resolve, reject) => {
      write.on('finish', resolve);
      write.on('error', reject);
      dump.on('error', reject);
      compress.on('error', reject);
    });

    const { status: dumpStatus } = await new Promise<{ status: number | null }>((resolve) => {
      dump.on('close', (code) => resolve({ status: code }));
    });

    if (dumpStatus !== 0) {
      throw new Error(`pg_dump exited with code ${dumpStatus}`);
    }
  } else {
    const dump = spawn('pg_dump', ['--no-owner', '--no-acl', '--format=custom'], { env });
    const write = createWriteStream(filePath);
    dump.stdout.pipe(write);

    await new Promise<void>((resolve, reject) => {
      write.on('finish', resolve);
      write.on('error', reject);
      dump.on('error', reject);
    });

    const { status: dumpStatus } = await new Promise<{ status: number | null }>((resolve) => {
      dump.on('close', (code) => resolve({ status: code }));
    });

    if (dumpStatus !== 0) {
      throw new Error(`pg_dump exited with code ${dumpStatus}`);
    }
  }

  const stats = statSync(filePath);
  logger.info(`pg_dump completed: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  return { filePath, sizeBytes: stats.size };
}

async function uploadToS3(filePath: string): Promise<{ key: string; bucket: string; region: string }> {
  const s3 = getS3Client();
  if (!s3) {
    throw new Error('S3 is not configured. Set BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, and BACKUP_S3_SECRET_ACCESS_KEY.');
  }

  const fileName = filePath.split('/').pop()!;
  const key = `database-backups/${fileName}`;

  logger.info(`Uploading backup to s3://${config.backup.s3.bucket}/${key}`);

  const fileStream = createReadStream(filePath);
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: config.backup.s3.bucket,
      Key: key,
      Body: fileStream,
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  });

  await upload.done();

  logger.info(`Backup uploaded successfully to s3://${config.backup.s3.bucket}/${key}`);

  return {
    key,
    bucket: config.backup.s3.bucket,
    region: config.backup.s3.region,
  };
}

async function cleanupLocalTemp(filePath: string): Promise<void> {
  try {
    unlinkSync(filePath);
    logger.info(`Cleaned up local temp file: ${filePath}`);
  } catch (error) {
    logger.warn(`Failed to clean up temp file ${filePath}:`, error);
  }
}

async function cleanupOldBackups(): Promise<void> {
  const s3 = getS3Client();
  if (!s3 || !config.backup.s3.bucket) return;

  const retentionDays = config.backup.retentionDays;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  logger.info(`Cleaning up backups older than ${retentionDays} days (before ${cutoff.toISOString()})`);

  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: config.backup.s3.bucket,
      Prefix: 'database-backups/',
      ContinuationToken: continuationToken,
    }));

    if (!response.Contents) break;

    for (const obj of response.Contents) {
      if (obj.LastModified && obj.LastModified < cutoff && obj.Key) {
        await s3.send(new DeleteObjectCommand({
          Bucket: config.backup.s3.bucket,
          Key: obj.Key,
        }));
        deleted++;
        logger.info(`Deleted old backup: ${obj.Key}`);
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  if (deleted > 0) {
    logger.info(`Cleanup complete: removed ${deleted} old backup(s)`);
  }
}

async function performBackup(job: Job<BackupJobData>): Promise<BackupResult> {
  const startTime = Date.now();
  const jobType = job.data.type || 'scheduled';
  logger.info(`Starting ${jobType} database backup (job ${job.id})`);

  let filePath: string | null = null;

  try {
    const result = await runPgDump();
    filePath = result.filePath;

    const uploadResult = await uploadToS3(result.filePath);

    cleanupLocalTemp(result.filePath).catch(() => {});
    filePath = null;

    await cleanupOldBackups();

    const durationMs = Date.now() - startTime;
    logger.info(`Backup job ${job.id} completed in ${(durationMs / 1000).toFixed(1)}s`);

    return {
      key: uploadResult.key,
      bucket: uploadResult.bucket,
      region: uploadResult.region,
      sizeBytes: result.sizeBytes,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    if (filePath) {
      cleanupLocalTemp(filePath).catch(() => {});
    }
    throw error;
  }
}

let backupWorker: Worker<BackupJobData> | null = null;

export function startBackupWorker(): Worker<BackupJobData> | null {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  if (backupWorker) {
    return backupWorker;
  }

  const redisUrl = new URL(process.env.REDIS_URL || (() => {
    throw new Error('REDIS_URL environment variable is required');
  })());

  backupWorker = new Worker<BackupJobData>(
    BACKUP_QUEUE_NAME,
    async (job) => performBackup(job),
    {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port) || 6379,
        password: redisUrl.password || undefined,
        maxRetriesPerRequest: null,
      },
      concurrency: 1,
    }
  );

  backupWorker.on('completed', (job) => {
    logger.info(`Backup job ${job.id} completed successfully`);
  });

  backupWorker.on('failed', (job, error) => {
    logger.error(`Backup job ${job?.id} failed: ${error.message}`);
  });

  return backupWorker;
}

export async function stopBackupWorker(): Promise<void> {
  if (!backupWorker) return;
  await backupWorker.close();
  backupWorker = null;
}

export async function scheduleBackupCron(): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;

  const cronSchedule = config.backup.cronSchedule;
  logger.info(`Scheduling database backup with cron: ${cronSchedule}`);

  const existing = await backupQueue.getJobSchedulers();
  const hasExisting = existing.some((s) => s.name === 'database-backup');
  if (hasExisting) return;

  await backupQueue.add(
    'database-backup',
    { type: 'scheduled' },
    {
      repeat: { pattern: cronSchedule },
      jobId: 'database-backup-scheduled',
    }
  );

  logger.info(`Database backup scheduled with cron: ${cronSchedule}`);
}

export type { BackupJobData, BackupResult };
export default backupWorker;
