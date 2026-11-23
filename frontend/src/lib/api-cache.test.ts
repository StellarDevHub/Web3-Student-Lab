import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequestCache } from './api-cache';

describe('apiRequestCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores successful responses in localStorage', async () => {
    const result = await apiRequestCache.fetch(
      'courses:list',
      async () => {
        return { id: 'c1', title: 'Blockchain Basics' };
      },
      { ttlMs: 1000 }
    );

    expect(result).toEqual({ id: 'c1', title: 'Blockchain Basics' });
    expect(localStorage.getItem('web3-student-lab-api-cache:courses:list')).toBeTruthy();
  });

  it('returns cached response when network fails and offline', async () => {
    const persisted = {
      data: { id: 'c2', title: 'Smart Contracts 101' },
      expiresAt: Date.now() + 1000,
    };
    localStorage.setItem('web3-student-lab-api-cache:courses:detail:c2', JSON.stringify(persisted));

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const result = await apiRequestCache.fetch(
      'courses:detail:c2',
      async () => {
        throw new Error('Network unavailable');
      },
      { ttlMs: 1000 }
    );

    expect(result).toEqual(persisted.data);
  });
});
