import {
  PermanentWebhookDeliveryError,
  deliverWebhook,
  startWebhookWorker,
  stopWebhookWorker,
} from './webhooks/index.js';

export { PermanentWebhookDeliveryError, deliverWebhook, startWebhookWorker, stopWebhookWorker };

export const startWorker = async (): Promise<void> => {
  startWebhookWorker();
};
