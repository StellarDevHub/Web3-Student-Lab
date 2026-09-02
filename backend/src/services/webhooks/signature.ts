import crypto from 'crypto';
import type { SignedWebhookHeaders } from './types.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(value[key]);
        return acc;
      }, {});
  }

  return value;
};

export const canonicalizeWebhookPayload = (payload: unknown): string => {
  return JSON.stringify(sortValue(payload));
};

export const createWebhookSignature = (
  payload: string,
  secret: string,
  timestamp: string
): string => {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
};

const safeCompare = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a, 'hex');
  const bBuffer = Buffer.from(b, 'hex');

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
};

export const verifyWebhookSignature = (
  payload: string,
  signature: string,
  secret: string,
  timestamp: string,
  toleranceMs = 5 * 60 * 1000,
  now: Date = new Date()
): boolean => {
  const parsedTimestamp = Date.parse(timestamp);

  if (Number.isNaN(parsedTimestamp)) {
    return false;
  }

  if (Math.abs(now.getTime() - parsedTimestamp) > toleranceMs) {
    return false;
  }

  const expectedSignature = createWebhookSignature(payload, secret, timestamp);

  try {
    return safeCompare(signature.replace(/^sha256=/, ''), expectedSignature);
  } catch {
    return false;
  }
};

export const buildSignedWebhookHeaders = (params: {
  deliveryId: string;
  eventType: string;
  payload: string;
  secret: string;
  timestamp?: string;
}): SignedWebhookHeaders => {
  const timestamp = params.timestamp ?? new Date().toISOString();
  const signature = createWebhookSignature(params.payload, params.secret, timestamp);

  return {
    'content-type': 'application/json',
    'x-webhook-delivery-id': params.deliveryId,
    'x-webhook-event': params.eventType,
    'x-webhook-signature': `sha256=${signature}`,
    'x-webhook-timestamp': timestamp,
  };
};

