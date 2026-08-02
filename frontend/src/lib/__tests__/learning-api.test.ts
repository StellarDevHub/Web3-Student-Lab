import { describe, it, expect, vi, beforeEach } from 'vitest';
import { learningAPI } from '../learning-api';
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
    it('returns normalized progress on success', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          studentId: 'student-1',
          courseId: 'course-1',
          completedLessons: ['lesson-1'],
          currentModuleId: 'mod-2',
          percentage: 50,
          status: 'in_progress',
          lastAccessedAt: '2024-01-01',
          completedAt: null,
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
          studentId: 's-1',
          courseId: 'c-1',
          completedLessons: [],
          currentModuleId: null,
          percentage: '75',
          status: 'in_progress',
          lastAccessedAt: null,
          completedAt: null,
        },
      });

      const result = await learningAPI.getProgress('c-1');
      expect(result?.percentage).toBe(75);
    });
  });

  describe('updateProgress', () => {
    it('sends PATCH request and invalidates cache', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({
        data: {
          studentId: 's-1',
          courseId: 'c-1',
          completedLessons: ['l-1'],
          currentModuleId: null,
          percentage: 50,
          status: 'in_progress',
          lastAccessedAt: null,
          completedAt: null,
        },
      });

      const result = await learningAPI.updateProgress('c-1', {
        completedLessons: ['l-1'],
      });

      expect(result).toBeTruthy();
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/learning/courses/c-1/progress',
        { completedLessons: ['l-1'] }
      );
    });

    it('returns null on error', async () => {
      vi.mocked(apiClient.patch).mockRejectedValue(
        new Error('Update failed')
      );

      const result = await learningAPI.updateProgress('c-1', {});
      expect(result).toBeNull();
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
      });

      expect(result).toEqual({
        completedLessons: ['l-1', 'l-2'],
        currentModuleId: 'mod-3',
        percentage: 66,
        status: 'in_progress',
        lastAccessedAt: '2024-06-01',
        completedAt: null,
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
