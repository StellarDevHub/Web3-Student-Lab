import {
  EndpointPausedError,
  PermanentWebhookDeliveryError,
  deliverWebhook,
} from './webhooks/index.js';
import { startWebhookWorker, stopWebhookWorker } from '../workers/webhookWorker.js';

export {
  EndpointPausedError,
  PermanentWebhookDeliveryError,
  deliverWebhook,
  startWebhookWorker,
  stopWebhookWorker,
};

export const startWorker = async (): Promise<void> => {
  startWebhookWorker();
};
