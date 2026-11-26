import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSessionStorage,
  getStoredSession,
  migrateLegacySession,
  storeEncryptedSession,
} from './credentialStorage';

describe('encrypted session storage', () => {
  afterEach(() => {
    clearSessionStorage();
  });

  it('stores session values as ciphertext and persists a non-extractable key', async () => {
    await storeEncryptedSession({
      token: 'sensitive-access-token',
      refreshToken: 'sensitive-refresh-token',
      user: { email: 'learner@example.test' },
    });

    const stored = localStorage.getItem('web3sl_passkey_auth_session');
    expect(stored).not.toContain('sensitive-access-token');
    expect(stored).not.toContain('sensitive-refresh-token');
    expect(await getStoredSession()).toEqual({
      token: 'sensitive-access-token',
      accessToken: 'sensitive-access-token',
      refreshToken: 'sensitive-refresh-token',
      user: { email: 'learner@example.test' },
    });

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('web3sl-credential-keys', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const key = await new Promise<CryptoKey>((resolve, reject) => {
      const request = database.transaction('keys', 'readonly').objectStore('keys').get('master');
      request.onsuccess = () => resolve(request.result as CryptoKey);
      request.onerror = () => reject(request.error);
    });
    expect(key.extractable).toBe(false);
    database.close();
  });

  it('clears a tampered encrypted session instead of returning stale state', async () => {
    await storeEncryptedSession({ token: 'sensitive-access-token' });
    const storageKey = 'web3sl_passkey_auth_session';
    const encrypted = JSON.parse(localStorage.getItem(storageKey)!);
    encrypted.data = `${encrypted.data.slice(0, -2)}AA`;
    localStorage.setItem(storageKey, JSON.stringify(encrypted));

    await expect(getStoredSession()).resolves.toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('encrypts and removes legacy plaintext session values during migration', async () => {
    localStorage.setItem('token', 'legacy-access-token');
    localStorage.setItem('user', JSON.stringify({ email: 'learner@example.test' }));

    await expect(migrateLegacySession()).resolves.toMatchObject({
      token: 'legacy-access-token',
      user: { email: 'learner@example.test' },
    });
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('web3sl_passkey_auth_session')).not.toContain(
      'legacy-access-token'
    );
  });
});
