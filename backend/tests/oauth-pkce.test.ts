import crypto from 'node:crypto';
import {
    assertExactRedirectUri,
    assertValidPkceChallenge,
    assertValidPkceVerifier,
    consumeOAuthLoginTicket,
    consumeOAuthPkceSession,
    createOAuthLoginTicket,
    createOAuthPkceSession,
} from '../src/auth/oauthPkce.js';

describe('OAuth PKCE sessions', () => {
  it('accepts only RFC 7636 verifier and S256 challenge formats', () => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    expect(() => assertValidPkceVerifier(verifier)).not.toThrow();
    expect(() => assertValidPkceChallenge(challenge)).not.toThrow();
    expect(() => assertValidPkceVerifier(undefined)).toThrow(/code_verifier/);
    expect(() => assertValidPkceVerifier('plain')).toThrow(/code_verifier/);
    expect(() => assertValidPkceChallenge('plain')).toThrow(/S256/);
  });

  it('requires an exact redirect URI and rejects wildcard registrations', () => {
    const registered = 'https://lab.example.edu/oauth/callback';

    expect(assertExactRedirectUri(registered, registered)).toBe(registered);
    expect(() => assertExactRedirectUri(`${registered}/other`, registered)).toThrow(/exactly match/);
    expect(() => assertExactRedirectUri('https://*.example.edu/callback', 'https://*.example.edu/callback'))
      .toThrow(/wildcard-free/);
  });

  it('creates an S256 challenge for the stored verifier', async () => {
    const { state, challenge } = await createOAuthPkceSession({
      provider: 'github',
      purpose: 'link',
      studentId: 'student-1',
    });
    const session = await consumeOAuthPkceSession('github', state);

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session).toMatchObject({ provider: 'github', purpose: 'link', studentId: 'student-1' });
    expect(session?.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(
      crypto.createHash('sha256').update(session!.verifier).digest('base64url')
    );
  });

  it('consumes state only once and rejects cross-provider use', async () => {
    const { state } = await createOAuthPkceSession({ provider: 'discord', purpose: 'login' });

    await expect(consumeOAuthPkceSession('github', state)).resolves.toBeNull();
    await expect(consumeOAuthPkceSession('discord', state)).resolves.toMatchObject({
      provider: 'discord',
      purpose: 'login',
    });
    await expect(consumeOAuthPkceSession('discord', state)).resolves.toBeNull();
  });

  it('exchanges login tickets only once', async () => {
    const ticket = await createOAuthLoginTicket({ subject: 'student-1' });

    await expect(consumeOAuthLoginTicket(ticket)).resolves.toEqual({ subject: 'student-1' });
    await expect(consumeOAuthLoginTicket(ticket)).resolves.toBeNull();
  });
});
