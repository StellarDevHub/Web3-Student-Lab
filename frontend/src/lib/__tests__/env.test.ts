import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPublicEnvCacheForTests,
  DEFAULT_HORIZON_URL,
  DEFAULT_SOROBAN_RPC_URL,
  getPublicEnv,
  validatePublicEnv,
} from '../env';

const VALID_CONTRACT_ID = `C${'A'.repeat(55)}`;

function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NEXT_PUBLIC_API_URL: 'https://api.example.com',
    NEXT_PUBLIC_WS_URL: 'wss://ws.example.com',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('validatePublicEnv', () => {
  it('accepts a fully valid configuration with no errors', () => {
    const { env, errors } = validatePublicEnv(
      makeEnv({
        NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://rpc.example.com',
        NEXT_PUBLIC_HORIZON_URL: 'https://horizon.example.com',
        NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID: VALID_CONTRACT_ID,
      }),
    );

    expect(errors).toEqual([]);
    expect(env.apiUrl).toBe('https://api.example.com');
    expect(env.wsUrl).toBe('wss://ws.example.com');
    expect(env.sorobanRpcUrl).toBe('https://rpc.example.com');
    expect(env.horizonUrl).toBe('https://horizon.example.com');
    expect(env.certificateContractId).toBe(VALID_CONTRACT_ID);
  });

  it('degrades optional Soroban/contract configuration gracefully when absent', () => {
    const { env, errors } = validatePublicEnv(makeEnv());

    expect(errors).toEqual([]);
    expect(env.sorobanRpcUrl).toBe(DEFAULT_SOROBAN_RPC_URL);
    expect(env.horizonUrl).toBe(DEFAULT_HORIZON_URL);
    expect(env.certificateContractId).toBeNull();
  });

  it('treats an explicitly empty contract id the same as absent, not malformed', () => {
    const { env, errors } = validatePublicEnv(
      makeEnv({ NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID: '' }),
    );

    expect(errors).toEqual([]);
    expect(env.certificateContractId).toBeNull();
  });

  it('reports a malformed contract id by name, without echoing the value', () => {
    const { errors } = validatePublicEnv(
      makeEnv({ NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID: 'not-a-contract-id' }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID');
    expect(errors[0]).not.toContain('not-a-contract-id');
  });

  it('reports a malformed API URL by name', () => {
    const { errors } = validatePublicEnv(makeEnv({ NEXT_PUBLIC_API_URL: 'not-a-url' }));

    expect(errors.some((e) => e.startsWith('NEXT_PUBLIC_API_URL'))).toBe(true);
  });

  it('flags required public config missing in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { env, errors } = validatePublicEnv({} as NodeJS.ProcessEnv);

    expect(errors).toContain('NEXT_PUBLIC_API_URL: required in production but not set');
    expect(errors).toContain('NEXT_PUBLIC_WS_URL: required in production but not set');
    expect(env.apiUrl).toBe('');
    expect(env.wsUrl).toBe('');
  });

  it('falls back to local dev defaults for API/WS URL outside production without erroring', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { env, errors } = validatePublicEnv({} as NodeJS.ProcessEnv);

    expect(errors).toEqual([]);
    expect(env.apiUrl).toBe('http://localhost:8080/api/v1');
    expect(env.wsUrl).toBe('ws://localhost:8080');
  });
});

describe('getPublicEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    __resetPublicEnvCacheForTests();
  });

  afterEach(() => {
    __resetPublicEnvCacheForTests();
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('throws in development with every problem listed by key, not value', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.NEXT_PUBLIC_API_URL = 'not-a-url';
    process.env.NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID = 'bad-id';

    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_API_URL/);
    __resetPublicEnvCacheForTests();
    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID/);
  });

  it('never throws in production, and logs diagnostics instead', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_API_URL = '';
    process.env.NEXT_PUBLIC_WS_URL = '';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const env = getPublicEnv();

    expect(env.apiUrl).toBe('');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('NEXT_PUBLIC_API_URL');
  });

  it('memoizes the result so validation only runs once per process', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_API_URL = '';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    getPublicEnv();
    process.env.NEXT_PUBLIC_API_URL = 'https://changed.example.com';
    const second = getPublicEnv();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(second.apiUrl).toBe('');
  });
});
