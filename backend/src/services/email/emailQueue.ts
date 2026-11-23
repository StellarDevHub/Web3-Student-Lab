import { Queue, Worker } from 'bullmq';
import logger from '../../utils/logger.js';
import { sendEmail, type EmailMessage } from '../emailService.js';

const connection = { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') };

export const emailQueue = new Queue('email-delivery', { connection });

export interface EmailJobData extends EmailMessage {
  metadata?: Record<string, unknown>;
}

export async function enqueueEmail(jobData: EmailJobData) {
  await emailQueue.add(
    'send-email',
    jobData,
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

export function processEmailQueue() {
  const worker = new Worker('email-delivery', async (job) => {
    const { to } = job.data as EmailJobData;
    logger.info(`Processing email job ${job.id} for ${to}`);
    await sendEmail(job.data as EmailJobData);
    logger.info(`Email sent to ${to}`);
    return { delivered: true };
  }, { connection });

  return worker;
}
