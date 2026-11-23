import crypto from 'node:crypto';
import { getRedisClient } from '../utils/redis.js';

export type OAuthProvider = 'github' | 'discord';

export interface OAuthPkceSession {
  provider: OAuthProvider;
  nonce: string;
  verifier: string;
  purpose: 'login' | 'link';
  studentId?: string;
}

const SESSION_TTL_SECONDS = 600;
const SESSION_PREFIX = 'oauth:pkce:';
const LOGIN_TICKET_TTL_SECONDS = 60;

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function createOAuthPkceSession(
  session: Omit<OAuthPkceSession, 'nonce' | 'verifier'>
): Promise<{ state: string; nonce: string; challenge: string }> {
  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const { verifier, challenge } = createPkcePair();
  const redis = getRedisClient();
  const storedSession: OAuthPkceSession = { ...session, nonce, verifier };
  const result = await redis.setex(
    `${SESSION_PREFIX}${session.provider}:${state}`,
    SESSION_TTL_SECONDS,
    JSON.stringify(storedSession)
  );

  if (result !== 'OK') {
    throw new Error('Unable to create OAuth session');
  }

  return { state, nonce, challenge };
}

/** Consume a session atomically so state cannot be replayed or used cross-provider. */
export async function consumeOAuthPkceSession(
  provider: OAuthProvider,
  state: string
): Promise<OAuthPkceSession | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;

  const redis = getRedisClient();
  const key = `${SESSION_PREFIX}${provider}:${state}`;
  const storedSession = await redis.getdel(key);

  if (typeof storedSession !== 'string') return null;

  try {
    const parsed = JSON.parse(storedSession) as OAuthPkceSession;
    if (
      parsed.provider !== provider ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.verifier !== 'string' ||
      !['login', 'link'].includes(parsed.purpose) ||
      (parsed.purpose === 'link' && typeof parsed.studentId !== 'string')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function createOAuthLoginTicket(payload: unknown): Promise<string> {
  const ticket = crypto.randomBytes(32).toString('base64url');
  const result = await getRedisClient().setex(
    `oauth:ticket:${ticket}`,
    LOGIN_TICKET_TTL_SECONDS,
    JSON.stringify(payload)
  );
  if (result !== 'OK') throw new Error('Unable to create OAuth login ticket');
  return ticket;
}

export async function consumeOAuthLoginTicket<T>(ticket: string): Promise<T | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) return null;
  const payload = await getRedisClient().getdel(`oauth:ticket:${ticket}`);
  if (typeof payload !== 'string') return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}