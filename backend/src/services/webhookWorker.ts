import { dequeueWebhook, enqueueWebhook, enqueueDLQ } from './queue.service.js';
import logger from '../utils/logger.js';

const MAX_RETRIES = 5;

const processWebhookLogic = async (payload: any) => {
  // Implement actual business logic here
  // e.g., update frontend state, database, etc.
  logger.info(`Processing webhook: ${JSON.stringify(payload)}`);

  // Simulate some logic
  if (payload.shouldFail) {
    throw new Error('Simulated processing failure');
  }
};

export const startWorker = async () => {
  logger.info('Webhook worker started');

  while (true) {
    try {
      const webhook = await dequeueWebhook();
      if (!webhook) continue;

      try {
        await processWebhookLogic(webhook);
      } catch (error) {
        if (webhook.retries < MAX_RETRIES) {
          webhook.retries += 1;
          const backoff = Math.pow(2, webhook.retries) * 1000;
          logger.warn(`Retrying webhook in ${backoff}ms (Attempt ${webhook.retries})`);

          setTimeout(async () => {
            await enqueueWebhook(webhook);
          }, backoff);
        } else {
          await enqueueDLQ(webhook, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } catch (error) {
      logger.error('Worker loop error:', error);
      // Wait a bit before continuing to avoid tight loop on error
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};
