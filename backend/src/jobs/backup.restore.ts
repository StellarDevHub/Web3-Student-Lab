import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { spawn } from 'child_process';
import { createWriteStream, unlinkSync, mkdirSync } from 'fs';
import { Readable } from 'stream';
import { join } from 'path';
import config from '../config/env.config.js';
import logger from '../utils/logger.js';

interface RestoreOptions {
  s3Key?: string;
  localFile?: string;
  targetDatabaseUrl?: string;
}

function getS3Client() {
  const { region, accessKeyId, secretAccessKey, endpoint } = config.backup.s3;
  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

function isCompressed(filePath: string): boolean {
  return filePath.endsWith('.gz');
}

async function downloadFromS3(key: string, destPath: string): Promise<void> {
  const s3 = getS3Client();
  logger.info(`Downloading s3://${config.backup.s3.bucket}/${key} to ${destPath}`);

  const response = await s3.send(new GetObjectCommand({
    Bucket: config.backup.s3.bucket,
    Key: key,
  }));

  const writeStream = createWriteStream(destPath);
  const body = response.Body as ReadableStream;

  await new Promise<void>((resolve, reject) => {
    if (body instanceof Readable) {
      body.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    } else if (body && typeof (body as any).pipe === 'function') {
      (body as any).pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    } else {
      reject(new Error('Unexpected response body type'));
    }
  });

  logger.info(`Downloaded ${key} to ${destPath}`);
}

async function runPgRestore(filePath: string, dbUrl: string): Promise<void> {
  const dbConfig = parseDatabaseUrl(dbUrl);
  const env = {
    ...process.env,
    PGHOST: dbConfig.host,
    PGPORT: String(dbConfig.port),
    PGUSER: dbConfig.user,
    PGPASSWORD: dbConfig.password,
    PGDATABASE: dbConfig.database,
  };

  logger.info(`Starting pg_restore to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

  if (isCompressed(filePath)) {
    const decompress = spawn('gunzip', ['-c', filePath], { stdio: ['pipe', 'pipe', 'inherit'] });
    const restore = spawn('pg_restore', ['--no-owner', '--no-acl', '--clean', '--if-exists', '-d', dbConfig.database], {
      env,
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    decompress.stdout.pipe(restore.stdin);

    const { status: decompressStatus } = await new Promise<{ status: number | null }>((resolve) => {
      decompress.on('close', (code) => resolve({ status: code }));
    });

    if (decompressStatus !== 0) {
      throw new Error(`gunzip exited with code ${decompressStatus}`);
    }

    const { status: restoreStatus } = await new Promise<{ status: number | null }>((resolve) => {
      restore.on('close', (code) => resolve({ status: code }));
    });

    if (restoreStatus !== 0) {
      throw new Error(`pg_restore exited with code ${restoreStatus}`);
    }
  } else {
    const restore = spawn('pg_restore', ['--no-owner', '--no-acl', '--clean', '--if-exists', '-d', dbConfig.database, filePath], {
      env,
      stdio: ['inherit', 'inherit', 'inherit'],
    });

    const { status } = await new Promise<{ status: number | null }>((resolve) => {
      restore.on('close', (code) => resolve({ status: code }));
    });

    if (status !== 0) {
      throw new Error(`pg_restore exited with code ${status}`);
    }
  }

  logger.info('Database restore completed successfully');
}

export async function restoreDatabase(options: RestoreOptions): Promise<void> {
  const dbUrl = options.targetDatabaseUrl || config.db.url;
  const startTime = Date.now();
  let localFile: string | null = null;

  try {
    if (options.s3Key) {
      const tempDir = config.backup.tempDir;
      mkdirSync(tempDir, { recursive: true });
      const fileName = options.s3Key.split('/').pop() || 'restore-tmp.sql.gz';
      localFile = join(tempDir, fileName);
      await downloadFromS3(options.s3Key, localFile);
    } else if (options.localFile) {
      localFile = options.localFile;
    } else {
      throw new Error('Provide either s3Key or localFile');
    }

    await runPgRestore(localFile, dbUrl);

    const durationMs = Date.now() - startTime;
    logger.info(`Restore completed in ${(durationMs / 1000).toFixed(1)}s`);
  } catch (error) {
    logger.error('Restore failed:', error);
    throw error;
  } finally {
    if (localFile && options.s3Key) {
      try { unlinkSync(localFile); } catch { /* ignore */ }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const s3KeyIndex = args.indexOf('--s3-key');
  const localFileIndex = args.indexOf('--local-file');
  const dbUrlIndex = args.indexOf('--db-url');

  const options: RestoreOptions = {};

  if (s3KeyIndex !== -1 && args[s3KeyIndex + 1]) {
    options.s3Key = args[s3KeyIndex + 1];
  }
  if (localFileIndex !== -1 && args[localFileIndex + 1]) {
    options.localFile = args[localFileIndex + 1];
  }
  if (dbUrlIndex !== -1 && args[dbUrlIndex + 1]) {
    options.targetDatabaseUrl = args[dbUrlIndex + 1];
  }

  if (!options.s3Key && !options.localFile) {
    console.error('Usage:');
    console.error('  ts-node backup.restore.ts --s3-key database-backups/<file>.sql.gz [--db-url <target>]');
    console.error('  ts-node backup.restore.ts --local-file /path/to/backup.sql.gz [--db-url <target>]');
    process.exit(1);
  }

  await restoreDatabase(options);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*[/\\]/, ''))) {
  main().catch((error) => {
    console.error('Restore failed:', error);
    process.exit(1);
  });
}

export default restoreDatabase;
