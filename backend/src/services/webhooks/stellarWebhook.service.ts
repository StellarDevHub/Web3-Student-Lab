import crypto from 'crypto';
import logger from '../../utils/logger.js';

export interface StellarHorizonWebhookPayload {
  eventType: 'payment_received' | 'ledger_closed' | 'account_credited';
  txHash: string;
  account: string;
  amount?: string;
  assetCode?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// In-memory set to store processed transaction hashes for idempotency guarantees
const processedTxHashes = new Set<string>();

export const getStellarWebhookSecret = (): string => {
  const secret = process.env.STELLAR_WEBHOOK_SECRET || process.env.WEBHOOK_SIGNING_SECRET || 'default-stellar-webhook-secret';
  return secret;
};

export const createStellarWebhookSignature = (
  payload: string,
  secret: string,
  timestamp: string
): string => {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
};

export const verifyStellarWebhookSignature = (
  payload: string,
  signature: string,
  secret: string,
  timestamp: string,
  toleranceMs: number = 5 * 60 * 1000, // 5 minutes
  now: Date = new Date()
): boolean => {
  if (!signature || !timestamp || !secret) {
    return false;
  }

  const parsedTimestamp = Date.parse(timestamp);
  if (Number.isNaN(parsedTimestamp)) {
    return false;
  }

  // Reject replay attacks outside the 5-minute tolerance window
  if (Math.abs(now.getTime() - parsedTimestamp) > toleranceMs) {
    logger.warn(`Stellar webhook timestamp out of tolerance window: ${timestamp}`);
    return false;
  }

  const expectedSignature = createStellarWebhookSignature(payload, secret, timestamp);
  const cleanSignature = signature.replace(/^sha256=/, '');

  const sigBuffer = Buffer.from(cleanSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
};

export const processStellarHorizonWebhook = async (
  event: StellarHorizonWebhookPayload
): Promise<{ status: 'processed' | 'already_processed'; txHash: string; credited: boolean }> => {
  const { txHash } = event;

  if (!txHash) {
    throw new Error('Missing transaction hash in webhook payload');
  }

  if (processedTxHashes.has(txHash)) {
    logger.info(`Stellar Horizon webhook tx ${txHash} was already processed. Suppressing duplicate balance credit.`);
    return {
      status: 'already_processed',
      txHash,
      credited: false,
    };
  }

  // Record transaction hash to enforce idempotency and prevent double-crediting
  processedTxHashes.add(txHash);

  logger.info(`Successfully processed Stellar Horizon webhook for tx ${txHash}`);
  return {
    status: 'processed',
    txHash,
    credited: true,
  };
};

export const resetProcessedStellarTxHashes = (): void => {
  processedTxHashes.clear();
};
