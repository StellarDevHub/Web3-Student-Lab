import { Request, Response, NextFunction } from 'express';
import axios from 'axios';

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerifyResult {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  error_codes?: string[];
  action?: string;
  cdata?: string;
}

/**
 * Verifies a Cloudflare Turnstile token against the siteverify API.
 *
 * Returns `true` when the token is valid and the request originated from
 * the expected hostname. Returns `false` on network errors, invalid tokens,
 * or when the token is missing.
 */
export async function verifyTurnstileToken(token: string, expectedHostname?: string): Promise<TurnstileVerifyResult> {
  if (!token) {
    return { success: false, error_codes: ['missing-input-response'] };
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', TURNSTILE_SECRET);
    params.append('response', token);
    if (expectedHostname) {
      params.append('hostname', expectedHostname);
    }

    const response = await axios.post(TURNSTILE_VERIFY_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000,
    });

    return response.data as TurnstileVerifyResult;
  } catch (error) {
    return {
      success: false,
      error_codes: ['network-error'],
    };
  }
}

/**
 * Express middleware factory that verifies Turnstile tokens on sensitive
 * authentication routes.
 *
 * Expects the client to send the token in `req.body.turnstileToken`.
 * On failure, responds with 400 Bad Request.
 */
export function requireTurnstile(expectedHostname?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!TURNSTILE_SECRET) {
      res.status(500).json({
        status: 'error',
        message: 'Turnstile verification is not configured on the server.',
      });
      return;
    }

    const token = (req.body && (req.body as any).turnstileToken) || '';
    const result = await verifyTurnstileToken(token, expectedHostname);

    if (!result.success) {
      res.status(400).json({
        status: 'error',
        message: 'Turnstile verification failed. Please complete the challenge and try again.',
        error_codes: result.error_codes,
      });
      return;
    }

    next();
  };
}
