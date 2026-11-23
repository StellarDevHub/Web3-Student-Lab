import crypto from 'crypto';
import type { SignedWebhookHeaders, WebhookDestination } from './types.js';

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

/**
 * GitHub-compatible `X-Hub-Signature-256` value (Issue BE-015). The signed
 * material binds the unix timestamp and a single-use nonce to the body so a
 * captured delivery cannot be replayed once the receiver has seen the nonce
 * or the timestamp has drifted outside the tolerance window.
 */
export const createHubSignature = (
  payload: string,
  secret: string,
  timestamp: string,
  nonce: string
): string => {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${payload}`)
    .digest('hex');
};

export const createWebhookNonce = (): string => crypto.randomBytes(16).toString('hex');

/**
 * Every endpoint is signed with its own key. Destinations registered with an
 * explicit secret use it; otherwise a distinct per-endpoint key is derived
 * from the platform master secret so one leaked key never verifies payloads
 * sent to another endpoint.
 */
export const resolveEndpointSecret = (destination: Pick<WebhookDestination, 'id' | 'url' | 'secret'>): string => {
  if (destination.secret) {
    return destination.secret;
  }
  const masterSecret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!masterSecret) {
    throw new Error('WEBHOOK_SIGNING_SECRET environment variable is required');
  }
  return crypto
    .createHmac('sha256', masterSecret)
    .update(`endpoint:${destination.id ?? destination.url}`)
    .digest('hex');
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
  nonce?: string;
}): SignedWebhookHeaders => {
  const timestamp = params.timestamp ?? new Date().toISOString();
  const signature = createWebhookSignature(params.payload, params.secret, timestamp);
  const nonce = params.nonce ?? createWebhookNonce();
  const unixTimestamp = String(Math.floor(Date.parse(timestamp) / 1000));
  const hubSignature = createHubSignature(params.payload, params.secret, unixTimestamp, nonce);

  return {
    'content-type': 'application/json',
    'x-webhook-delivery-id': params.deliveryId,
    'x-webhook-event': params.eventType,
    'x-webhook-signature': `sha256=${signature}`,
    'x-webhook-timestamp': timestamp,
    'x-hub-signature-256': `sha256=${hubSignature}`,
    'x-webhook-nonce': nonce,
    'x-webhook-unix-timestamp': unixTimestamp,
  };
};

