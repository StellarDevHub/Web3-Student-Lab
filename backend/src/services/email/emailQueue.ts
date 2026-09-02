import { Queue } from 'bullmq';
import logger from '../utils/logger.js';

const connection = { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') };

export const emailQueue = new Queue('email-delivery', { connection });

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
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

export async function processEmailQueue() {
  emailQueue.process('send-email', async (job) => {
    const { to, subject, html, attachments } = job.data as EmailJobData;
    logger.info(`Processing email job ${job.id} for ${to}`);

    // Email provider integration (Resend/SendGrid)
    // In production, replace with actual provider SDK call
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'noreply@web3studentlab.example',
          to,
          subject,
          html,
          attachments: attachments?.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content, 'base64'),
            contentType: a.contentType || 'application/pdf',
          })),
        });
        logger.info(`Email sent to ${to}`);
        return { delivered: true };
      } catch (error) {
        logger.error(`Email delivery failed for ${to}:`, error);
        throw error;
      }
    }

    if (process.env.SENDGRID_API_KEY) {
      try {
        const sgMail = await import('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to,
          from: process.env.EMAIL_FROM || 'noreply@web3studentlab.example',
          subject,
          html,
          attachments: attachments?.map((a) => ({
            content: Buffer.from(a.content, 'base64'),
            filename: a.filename,
            type: a.contentType || 'application/pdf',
            disposition: 'attachment',
          })),
        });
        logger.info(`Email sent to ${to}`);
        return { delivered: true };
      } catch (error) {
        logger.error(`Email delivery failed for ${to}:`, error);
        throw error;
      }
    }

    logger.warn(`No email provider configured. Would send email to ${to}: ${subject}`);
    return { delivered: false, reason: 'No provider configured' };
  });
}
