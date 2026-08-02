import crypto from 'crypto';

export const verifySignature = (payload: string, signature: string, secret: string): boolean => {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(digest, 'hex'));
  } catch (error) {
    return false;
  }
};
