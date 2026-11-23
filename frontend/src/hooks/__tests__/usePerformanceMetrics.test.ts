import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePerformanceMetrics } from '../usePerformanceMetrics';
import apiClient from '@/lib/api-client';
import { generateMockMetrics } from '@/lib/analytics/performanceMetrics';

vi.mock('@/lib/api-client', () => ({
  default: { get: vi.fn() },
}));

const mockGet = vi.mocked(apiClient.get);

const LIVE_PAYLOAD = {
  performance: {
    coursesCompleted: 4,
    coursesEnrolled: 6,
    totalTimeSpentMinutes: 720,
    currentStreakDays: 5,
    averageScore: 88,
  },
  timeSpent: [
    { date: 'Jul 30', minutes: 45 },
    { date: 'Jul 31', minutes: 60 },
  ],
};

const NETWORK_ERROR = Object.assign(new Error('Network Error'), {
  isAxiosError: true,
  code: 'ERR_NETWORK',
  response: undefined,
});

describe('usePerformanceMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports live data on a successful fetch', async () => {
    mockGet.mockResolvedValue({ data: LIVE_PAYLOAD });

    const { result } = renderHook(() => usePerformanceMetrics('student-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/analytics/user/student-1');
    expect(result.current.dataSource).toBe('live');
    expect(result.current.isFallback).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.metrics.coursesCompleted).toBe(4);
    expect(result.current.metrics.averageScore).toBe(88);
    expect(result.current.timeSpent).toHaveLength(2);
    expect(result.current.lastVerifiedAt).not.toBeNull();
  });

  it('treats an empty-but-successful response as live, not fallback', async () => {
    mockGet.mockResolvedValue({ data: { performance: {} } });

    const { result } = renderHook(() => usePerformanceMetrics());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.dataSource).toBe('live');
    expect(result.current.isFallback).toBe(false);
    expect(result.current.metrics.coursesCompleted).toBe(0);
    expect(result.current.metrics.averageScore).toBe(0);
  });

  it('falls back to mock data when no live snapshot exists yet', async () => {
    mockGet.mockRejectedValue(NETWORK_ERROR);

    const { result } = renderHook(() => usePerformanceMetrics());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.dataSource).toBe('fallback');
    expect(result.current.isFallback).toBe(true);
    expect(result.current.lastVerifiedAt).toBeNull();
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
    expect(result.current.error?.retriable).toBe(true);
    expect(result.current.metrics).toEqual(generateMockMetrics());
  });

  it('keeps the last verified snapshot (cached) when a later refresh fails', async () => {
    mockGet.mockResolvedValueOnce({ data: LIVE_PAYLOAD });

    const { result } = renderHook(() => usePerformanceMetrics());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.dataSource).toBe('live');

    const liveVerifiedAt = result.current.lastVerifiedAt;
    const liveMetrics = result.current.metrics;

    mockGet.mockRejectedValueOnce(NETWORK_ERROR);

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.dataSource).toBe('cached');
    expect(result.current.isFallback).toBe(false);
    expect(result.current.metrics).toEqual(liveMetrics);
    expect(result.current.lastVerifiedAt).toBe(liveVerifiedAt);
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
  });

  it('recovers to live data after a failed refresh', async () => {
    mockGet.mockResolvedValueOnce({ data: LIVE_PAYLOAD });
    mockGet.mockRejectedValueOnce(NETWORK_ERROR);

    const { result } = renderHook(() => usePerformanceMetrics());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.dataSource).toBe('live');

    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.dataSource).toBe('cached');

    mockGet.mockResolvedValueOnce({ data: LIVE_PAYLOAD });

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.dataSource).toBe('live');
    expect(result.current.error).toBeNull();
    expect(result.current.isFallback).toBe(false);
  });

  it('uses the overview endpoint when no userId is given', async () => {
    mockGet.mockResolvedValue({ data: LIVE_PAYLOAD });

    const { result } = renderHook(() => usePerformanceMetrics());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/analytics/overview');
  });
});
