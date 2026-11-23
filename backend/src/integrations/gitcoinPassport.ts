/**
 * Gitcoin (Human) Passport Stamps API v2 client (Issue BE-019).
 *
 * GET {base}/v2/stamps/{scorer_id}/score/{address}
 * Docs: https://docs.passport.xyz/building-with-passport/stamps/passport-api
 */

export interface PassportScore {
  address: string;
  /** Unique-humanity score as reported by the scorer (typically 0-100). */
  score: number;
  threshold: number;
  passing: boolean;
  /** Providers of the stamps that contributed to the score. */
  stampProviders: string[];
  lastScoreTimestamp?: string;
  expirationTimestamp?: string;
}

interface PassportScoreResponse {
  address?: string;
  score?: string | number | null;
  passing_score?: boolean;
  threshold?: string | number | null;
  last_score_timestamp?: string | null;
  expiration_timestamp?: string | null;
  error?: string | null;
  stamps?: Record<string, { score?: string | number; dedup?: boolean } | null> | null;
}

export class GitcoinPassportError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'GitcoinPassportError';
  }
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isGitcoinPassportConfigured(): boolean {
  return Boolean(process.env.GITCOIN_PASSPORT_API_KEY && process.env.GITCOIN_PASSPORT_SCORER_ID);
}

export async function fetchPassportScore(address: string): Promise<PassportScore> {
  if (!EVM_ADDRESS.test(address)) {
    throw new GitcoinPassportError('Gitcoin Passport requires an EVM (0x...) address', 400);
  }
  const apiKey = process.env.GITCOIN_PASSPORT_API_KEY;
  const scorerId = process.env.GITCOIN_PASSPORT_SCORER_ID;
  if (!apiKey || !scorerId) {
    throw new GitcoinPassportError('GITCOIN_PASSPORT_API_KEY and GITCOIN_PASSPORT_SCORER_ID are required');
  }

  const baseUrl = process.env.GITCOIN_PASSPORT_API_URL || 'https://api.passport.xyz';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.GITCOIN_PASSPORT_TIMEOUT_MS || '8000'));
  timer.unref?.();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/stamps/${encodeURIComponent(scorerId)}/score/${address.toLowerCase()}`,
      {
        method: 'GET',
        headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new GitcoinPassportError(`Gitcoin Passport API failed with status ${response.status}`, response.status);
  }

  const body = (await response.json()) as PassportScoreResponse;
  if (body.error) {
    throw new GitcoinPassportError(`Gitcoin Passport scoring error: ${body.error}`);
  }

  const score = Number(body.score ?? 0);
  const threshold = Number(body.threshold ?? 20);
  const stampProviders = Object.entries(body.stamps ?? {})
    .filter(([, stamp]) => stamp && !stamp.dedup && Number(stamp.score ?? 0) > 0)
    .map(([provider]) => provider)
    .sort();

  return {
    address: (body.address ?? address).toLowerCase(),
    score: Number.isFinite(score) ? score : 0,
    threshold: Number.isFinite(threshold) ? threshold : 20,
    passing: body.passing_score ?? score >= threshold,
    stampProviders,
    ...(body.last_score_timestamp ? { lastScoreTimestamp: body.last_score_timestamp } : {}),
    ...(body.expiration_timestamp ? { expirationTimestamp: body.expiration_timestamp } : {}),
  };
}
