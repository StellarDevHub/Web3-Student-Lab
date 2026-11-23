import crypto from 'node:crypto';
import {
  consumeOAuthPkceSession,
  consumeOAuthLoginTicket,
  createOAuthLoginTicket,
  createOAuthPkceSession,
} from '../src/auth/oauthPkce.js';

describe('OAuth PKCE sessions', () => {
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