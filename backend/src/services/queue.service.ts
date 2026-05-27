import redis from '../utils/redis.js';
import logger from '../utils/logger.js';

const WEBHOOK_QUEUE = 'webhooks:queue';
const WEBHOOK_DLQ = 'webhooks:dlq';

export const enqueueWebhook = async (payload: any): Promise<void> => {
  await redis.lpush(
    WEBHOOK_QUEUE,
    JSON.stringify({
      ...payload,
      enqueuedAt: Date.now(),
      retries: 0,
    })
  );
};

export const dequeueWebhook = async (): Promise<any | null> => {
  const data = await redis.brpop(WEBHOOK_QUEUE, 0); // Block until data is available
  if (data) {
    return JSON.parse(data[1]);
  }
  return null;
};

export const enqueueDLQ = async (payload: any, error: string): Promise<void> => {
  await redis.lpush(
    WEBHOOK_DLQ,
    JSON.stringify({
      ...payload,
      failedAt: Date.now(),
      error,
    })
  );
  logger.error(`Webhook moved to DLQ: ${error}`);
};
