import { describe, expect, it } from 'vitest';
import { normalizeAuthResponse } from '@/lib/api';

describe('normalizeAuthResponse', () => {
  it('normalizes legacy password-auth responses to a single session shape', () => {
    const result = normalizeAuthResponse({
      user: {
        id: 'user-1',
        email: 'student@example.com',
        name: 'Student User',
      },
      token: 'legacy-token',
      refreshToken: 'refresh-token',
    });

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'student@example.com',
      name: 'Student User',
    });
    expect(result.token).toBe('legacy-token');
    expect(result.accessToken).toBe('legacy-token');
    expect(result.refreshToken).toBe('refresh-token');
  });

  it('prefers accessToken and supports nested SEP-10 payloads', () => {
    const result = normalizeAuthResponse({
      data: {
        user: {
          id: 'wallet-user',
          email: 'wallet@example.com',
          name: 'Wallet User',
        },
        accessToken: 'sep10-token',
        refreshToken: 'sep10-refresh',
      },
    });

    expect(result.user).toEqual({
      id: 'wallet-user',
      email: 'wallet@example.com',
      name: 'Wallet User',
    });
    expect(result.token).toBe('sep10-token');
    expect(result.accessToken).toBe('sep10-token');
    expect(result.refreshToken).toBe('sep10-refresh');
  });
});
