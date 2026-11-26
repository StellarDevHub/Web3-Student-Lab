import type { NextFunction, Request, Response } from 'express';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;

export interface TurnstileVerifyResult {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  error_codes?: string[];
  action?: string;
  cdata?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Verifies a Cloudflare Turnstile token against the siteverify API.
 * Network and provider failures are reported separately from invalid tokens.
 */
export async function verifyTurnstileToken(
  token: string,
  expectedHostname?: string,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET?.trim();
  if (!secret) {
    return { success: false, error_codes: ['missing-input-secret'] };
  }
  if (!token) {
    return { success: false, error_codes: ['missing-input-response'] };
  }

  const params = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) params.set('remoteip', remoteIp);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { success: false, error_codes: ['verification-service-error'] };
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.success !== 'boolean') {
      return { success: false, error_codes: ['invalid-verification-response'] };
    }

    const errorCodes = Array.isArray(payload['error-codes'])
      ? payload['error-codes'].filter((code): code is string => typeof code === 'string')
      : undefined;
    const result: TurnstileVerifyResult = {
      success: payload.success,
      challenge_ts: typeof payload.challenge_ts === 'string' ? payload.challenge_ts : undefined,
      hostname: typeof payload.hostname === 'string' ? payload.hostname : undefined,
      error_codes: errorCodes,
      action: typeof payload.action === 'string' ? payload.action : undefined,
      cdata: typeof payload.cdata === 'string' ? payload.cdata : undefined,
    };

    if (
      result.success &&
      expectedHostname &&
      result.hostname?.toLowerCase() !== expectedHostname.toLowerCase()
    ) {
      return { ...result, success: false, error_codes: ['hostname-mismatch'] };
    }

    return result;
  } catch {
    return { success: false, error_codes: ['verification-service-error'] };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Rejects requests without a valid Cloudflare Turnstile token.
 * Accepts the standard form field and the legacy JSON `turnstileToken` field.
 */
export function requireTurnstile(expectedHostname?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }

    const body = isRecord(req.body) ? req.body : {};
    const tokenHeader = req.get('cf-turnstile-response');
    const bodyToken = body['cf-turnstile-response'] ?? body.turnstileToken;
    const token = (typeof tokenHeader === 'string' ? tokenHeader : bodyToken);

    if (typeof token !== 'string' || token.trim().length === 0) {
      res.status(403).json({
        status: 'error',
        message: 'Turnstile verification failed. Please complete the challenge and try again.',
        error_codes: ['missing-input-response'],
      });
      return;
    }

    if (!process.env.TURNSTILE_SECRET?.trim()) {
      res.status(503).json({
        status: 'error',
        message: 'Turnstile verification is not configured on the server.',
      });
      return;
    }

    const hostname = expectedHostname ?? process.env.TURNSTILE_EXPECTED_HOSTNAME;
    const result = await verifyTurnstileToken(token.trim(), hostname, req.ip);
    if (!result.success) {
      const unavailable = result.error_codes?.includes('verification-service-error') ||
        result.error_codes?.includes('invalid-verification-response');
      res.status(unavailable ? 503 : 403).json({
        status: 'error',
        message: unavailable
          ? 'Turnstile verification is temporarily unavailable.'
          : 'Turnstile verification failed. Please complete the challenge and try again.',
        error_codes: result.error_codes,
      });
      return;
    }

    next();
  };
}
