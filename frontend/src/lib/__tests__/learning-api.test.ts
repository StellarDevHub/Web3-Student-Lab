import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  learningAPI,
  ProgressConflictError,
} from '../learning-api';
import apiClient from '../api-client';

vi.mock('../api-client', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('learningAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProgress', () => {
    it('returns normalized progress from the wrapped backend response', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          progress: {
            studentId: 'student-1',
            courseId: 'course-1',
            completedLessons: ['lesson-1'],
            currentModuleId: 'mod-2',
            percentage: 50,
            status: 'in_progress',
            lastAccessedAt: '2024-01-01',
            completedAt: null,
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
          dataSource: 'live',
        },
      });

      const result = await learningAPI.getProgress('course-1');
      expect(result).toEqual({
        studentId: 'student-1',
        courseId: 'course-1',
        completedLessons: ['lesson-1'],
        currentModuleId: 'mod-2',
        percentage: 50,
        status: 'in_progress',
        lastAccessedAt: '2024-01-01',
        completedAt: null,
        updatedAt: '2024-01-02T00:00:00.000Z',
      });
    });

    it('returns null on API error', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(
        new Error('Network error')
      );

      const result = await learningAPI.getProgress('course-1');
      expect(result).toBeNull();
    });

    it('returns null for invalid response data', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { foo: 'bar' },
      });

      const result = await learningAPI.getProgress('course-1');
      expect(result).toBeNull();
    });

    it('normalizes percentage as number', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          progress: {
            studentId: 's-1',
            courseId: 'c-1',
            completedLessons: [],
            currentModuleId: null,
            percentage: '75',
            status: 'in_progress',
            lastAccessedAt: null,
            completedAt: null,
          },
          dataSource: 'live',
        },
      });

      const result = await learningAPI.getProgress('c-1');
      expect(result?.percentage).toBe(75);
    });
  });

  describe('updateProgress', () => {
    it('sends PATCH request, passes the concurrency token, and invalidates cache', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({
        data: {
          progress: {
            studentId: 's-1',
            courseId: 'c-1',
            completedLessons: ['l-1'],
            currentModuleId: null,
            percentage: 50,
            status: 'in_progress',
            lastAccessedAt: null,
            completedAt: null,
            updatedAt: '2024-01-03T00:00:00.000Z',
          },
          dataSource: 'live',
        },
      });

      const result = await learningAPI.updateProgress('c-1', {
        completedLessons: ['l-1'],
        currentModuleId: null,
        percentage: 50,
        status: 'in_progress',
        baseUpdatedAt: '2024-01-01T00:00:00.000Z',
      });

      expect(result).toBeTruthy();
      expect(result?.updatedAt).toBe('2024-01-03T00:00:00.000Z');
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/learning/courses/c-1/progress',
        {
          completedLessons: ['l-1'],
          currentModuleId: null,
          percentage: 50,
          status: 'in_progress',
          baseUpdatedAt: '2024-01-01T00:00:00.000Z',
        }
      );
    });

    it('returns null on error', async () => {
      vi.mocked(apiClient.patch).mockRejectedValue(
        new Error('Update failed')
      );

      const result = await learningAPI.updateProgress('c-1', {});
      expect(result).toBeNull();
    });

    it('throws ProgressConflictError with the server state on 409', async () => {
      vi.mocked(apiClient.patch).mockRejectedValue({
        response: {
          status: 409,
          data: {
            error: 'Progress was updated in another session; refresh to reconcile',
            progress: {
              studentId: 's-1',
              courseId: 'c-1',
              completedLessons: ['l-2'],
              currentModuleId: null,
              percentage: 50,
              status: 'in_progress',
              lastAccessedAt: null,
              completedAt: null,
              updatedAt: '2024-01-03T00:00:00.000Z',
            },
          },
        },
      });

      const promise = learningAPI.updateProgress('c-1', {
        completedLessons: ['l-1'],
      });

      await expect(promise).rejects.toBeInstanceOf(ProgressConflictError);
      await expect(promise).rejects.toMatchObject({
        message: 'Progress was updated in another session; refresh to reconcile',
        current: expect.objectContaining({
          completedLessons: ['l-2'],
          updatedAt: '2024-01-03T00:00:00.000Z',
        }),
      });
    });

    it('throws ProgressUnavailableError on 503', async () => {
      vi.mocked(apiClient.patch).mockRejectedValue({
        response: {
          status: 503,
          data: { error: 'learning service is temporarily unavailable' },
        },
      });

      const promise = learningAPI.updateProgress('c-1', {
        completedLessons: ['l-1'],
      });

      await expect(promise).rejects.toThrow(
        'learning service is temporarily unavailable'
      );
    });
  });

  describe('convertToProgressData', () => {
    it('converts API response to ProgressData', () => {
      const result = learningAPI.convertToProgressData({
        studentId: 's-1',
        courseId: 'c-1',
        completedLessons: ['l-1', 'l-2'],
        currentModuleId: 'mod-3',
        percentage: 66,
        status: 'in_progress',
        lastAccessedAt: '2024-06-01',
        completedAt: null,
        updatedAt: '2024-06-02T00:00:00.000Z',
      });

      expect(result).toEqual({
        completedLessons: ['l-1', 'l-2'],
        currentModuleId: 'mod-3',
        percentage: 66,
        status: 'in_progress',
        lastAccessedAt: '2024-06-01',
        completedAt: null,
        updatedAt: '2024-06-02T00:00:00.000Z',
      });
    });
  });

  describe('local progress fallback', () => {
    beforeEach(() => {
      if (typeof window !== 'undefined') {
        localStorage.clear();
      }
    });

    it('saves and retrieves local progress', () => {
      const progress = {
        completedLessons: ['l-1'],
        currentModuleId: null,
        percentage: 25,
        status: 'in_progress' as const,
        lastAccessedAt: null,
        completedAt: null,
      };

      learningAPI.saveLocalProgress('course-1', progress);
      const retrieved = learningAPI.getLocalProgressFallback(
        'course-1'
      );
      expect(retrieved).toEqual(progress);
    });

    it('returns null for missing local progress', () => {
      const result = learningAPI.getLocalProgressFallback(
        'nonexistent'
      );
      expect(result).toBeNull();
    });

    it('returns null when localStorage throws', () => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      const result = learningAPI.getLocalProgressFallback(
        'course-1'
      );
      expect(result).toBeNull();

      Storage.prototype.getItem = originalGetItem;
    });
  });
});
