import {
  enqueueWebhookDelivery,
  enqueueWebhookDeliveries,
  webhookDeadLetterQueue,
  webhookDeliveryQueue,
  WEBHOOK_DEAD_LETTER_QUEUE_NAME,
  WEBHOOK_DELIVERY_QUEUE_NAME,
} from './webhooks/index.js';
import type {
  DeadLetterWebhookJob,
  WebhookDeliveryJobData,
  WebhookDeliveryRequest,
} from './webhooks/index.js';

export const enqueueWebhook = async (payload: WebhookDeliveryRequest): Promise<void> => {
  await enqueueWebhookDelivery(payload);
};

export const enqueueWebhooks = async (
  event: WebhookDeliveryRequest['event'],
  destinations: WebhookDeliveryRequest['destination'][]
): Promise<Array<{ deliveryId: string; queue: string }>> => {
  return enqueueWebhookDeliveries(event, destinations);
};

export const enqueueDLQ = async (payload: WebhookDeliveryJobData, error: string): Promise<void> => {
  const deadLetterJob: DeadLetterWebhookJob = {
    ...payload,
    failedAt: new Date().toISOString(),
    error,
  };

  await webhookDeadLetterQueue.add(payload.event.type, deadLetterJob);
};

export const dequeueWebhook = async (): Promise<null> => {
  throw new Error(
    `Manual dequeue is not supported by ${WEBHOOK_DELIVERY_QUEUE_NAME}; use BullMQ workers instead`
  );
};

export {
  webhookDeadLetterQueue,
  webhookDeliveryQueue,
  WEBHOOK_DEAD_LETTER_QUEUE_NAME,
  WEBHOOK_DELIVERY_QUEUE_NAME,
};

