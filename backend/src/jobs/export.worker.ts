import { Job, Worker } from 'bullmq';
import fs from 'fs/promises';
import { Parser } from 'json2csv';
import path from 'path';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';
import { redisConnection } from '../utils/redis.js';
import { broadcastEvent } from '../websocket/gateway.js';

const EXPORTS_DIR = path.join(process.cwd(), 'exports');

// Ensure exports directory exists
try {
  await fs.mkdir(EXPORTS_DIR, { recursive: true });
} catch (err) {
  logger.error('Failed to create exports directory', err);
}

export const EXPORT_QUEUE_NAME = 'export-queue';

interface ExportJobData {
  type: 'students' | 'audit' | 'courses';
  format: 'csv' | 'json';
  userId: string;
}

const publishExportProgress = async (
  job: Job<ExportJobData>,
  progress: number,
  stage: string
): Promise<void> => {
  await job.updateProgress(progress);

  await broadcastEvent('user_metrics_updated', {
    userId: job.data.userId,
    type: 'EXPORT_PROGRESS',
    jobId: job.id,
    progress,
    stage,
    timestamp: new Date().toISOString(),
  });
};

const worker = new Worker(
  EXPORT_QUEUE_NAME,
  async (job: Job<ExportJobData>) => {
    const { type, format, userId } = job.data;
    logger.info(
      `Starting export job ${job.id} for user ${userId}, type: ${type}, format: ${format}`
    );

    await publishExportProgress(job, 5, 'started');

    let data: unknown[] = [];

    // Simulate heavy querying
    if (type === 'students') {
      data = await prisma.student.findMany({
        include: { enrollments: true, certificates: true },
      });
    } else if (type === 'audit') {
      data = await prisma.auditLog.findMany();
    } else if (type === 'courses') {
      data = await prisma.course.findMany();
    }

    await publishExportProgress(job, 40, 'data_loaded');

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 5000));

    let content: string;
    let fileName = `export-${type}-${job.id}.${format}`;
    let filePath = path.join(EXPORTS_DIR, fileName);

    if (format === 'csv') {
      const parser = new Parser();
      content = parser.parse(data);
    } else {
      content = JSON.stringify(data, null, 2);
    }

    await publishExportProgress(job, 75, 'file_prepared');

    await fs.writeFile(filePath, content);
    await publishExportProgress(job, 95, 'file_written');

    logger.info(`Export job ${job.id} completed. File saved to ${filePath}`);

    const result = {
      fileName,
      downloadUrl: `/api/v1/export/download/${fileName}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    // Notify user via WebSocket
    await broadcastEvent('user_metrics_updated', {
      userId,
      type: 'EXPORT_COMPLETED',
      jobId: job.id,
      progress: 100,
      result,
      timestamp: new Date().toISOString(),
    });

    return result;
  },
  {
    connection: redisConnection,
  }
);

// Cleanup job: Delete files older than 24 hours every hour
const CLEANUP_QUEUE_NAME = 'cleanup-queue';
const _cleanupWorker = new Worker(
  CLEANUP_QUEUE_NAME,
  async () => {
    logger.info('Running export files cleanup...');
    const files = await fs.readdir(EXPORTS_DIR);
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(EXPORTS_DIR, file);
      const stats = await fs.stat(filePath);
      if (now - stats.ctime.getTime() > dayInMs) {
        await fs.unlink(filePath);
        logger.info(`Deleted expired export file: ${file}`);
      }
    }
  },
  { connection: redisConnection }
);

import { Queue } from 'bullmq';
const cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, { connection: redisConnection });
await cleanupQueue.add(
  'cleanup',
  {},
  {
    repeat: { pattern: '0 * * * *' }, // Every hour
  }
);

worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);

  if (job?.data?.userId) {
    void broadcastEvent('user_metrics_updated', {
      userId: job.data.userId,
      type: 'EXPORT_FAILED',
      jobId: job.id,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default worker;
