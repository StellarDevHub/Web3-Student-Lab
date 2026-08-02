import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDependencyUpdates } from '../../hooks/useDependencyUpdates';

const SAMPLE_TOML = '[dependencies]\nsoroban-sdk = "21.7.6"\n';

const CHECK_RESPONSE = {
  status: 'success',
  dependencies: [
    {
      name: 'soroban-sdk',
      currentVersion: '21.7.6',
      latestVersion: '22.0.7',
      isOutdated: true,
      updateType: 'major',
      releaseNotes: 'Protocol 22 support.',
    },
  ],
  outdatedCount: 1,
  checkedAt: '2026-06-27T10:00:00.000Z',
  cargoTomlHash: 'abc123',
};

const UPDATE_RESPONSE = {
  status: 'success',
  updated: ['soroban-sdk'],
  failed: [],
  suggestedCargoToml: '[dependencies]\nsoroban-sdk = "22.0.7"\n',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDependencyUpdates', () => {
  it('initialises with null results and no loading state', () => {
    const { result } = renderHook(() => useDependencyUpdates());
    expect(result.current.checkResult).toBeNull();
    expect(result.current.updateResult).toBeNull();
    expect(result.current.isChecking).toBe(false);
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets checkResult on successful checkDependencies call', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => CHECK_RESPONSE,
    } as Response);

    const { result } = renderHook(() => useDependencyUpdates());

    await act(async () => {
      await result.current.checkDependencies(SAMPLE_TOML);
    });

    expect(result.current.checkResult).toMatchObject({
      outdatedCount: 1,
      cargoTomlHash: 'abc123',
    });
    expect(result.current.isChecking).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failed checkDependencies call', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ status: 'error', message: 'Server error' }),
    } as Response);

    const { result } = renderHook(() => useDependencyUpdates());

    await act(async () => {
      await result.current.checkDependencies(SAMPLE_TOML);
    });

    expect(result.current.checkResult).toBeNull();
    expect(result.current.error).toBe('Server error');
  });

  it('sets error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'));

    const { result } = renderHook(() => useDependencyUpdates());

    await act(async () => {
      await result.current.checkDependencies(SAMPLE_TOML);
    });

    expect(result.current.error).toBe('Network failure');
  });

  it('sets updateResult on successful applyUpdates call', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => UPDATE_RESPONSE,
    } as Response);

    const { result } = renderHook(() => useDependencyUpdates());

    await act(async () => {
      await result.current.applyUpdates(SAMPLE_TOML, ['soroban-sdk']);
    });

    expect(result.current.updateResult).toMatchObject({
      updated: ['soroban-sdk'],
      failed: [],
    });
    expect(result.current.isUpdating).toBe(false);
  });

  it('clears state on reset', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => CHECK_RESPONSE,
    } as Response);

    const { result } = renderHook(() => useDependencyUpdates());

    await act(async () => {
      await result.current.checkDependencies(SAMPLE_TOML);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.checkResult).toBeNull();
    expect(result.current.updateResult).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
