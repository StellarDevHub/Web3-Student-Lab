import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRoadmapProgress } from '../useRoadmapProgress';
import {
  learningAPI,
  ProgressUnavailableError,
  ProgressConflictError,
} from '@/lib/learning-api';
import * as learningJourney from '@/lib/learning-journey';
import { useUserStore } from '@/stores/userStore';
import type { Course } from '@/lib/api';

vi.mock('@/lib/learning-api', () => {
  class ProgressUnavailableError extends Error {
    constructor(message = 'Progress could not be saved') {
      super(message);
      this.name = 'ProgressUnavailableError';
    }
  }
  class ProgressConflictError extends Error {
    current: unknown;
    constructor(message = 'Conflict', current: unknown = null) {
      super(message);
      this.name = 'ProgressConflictError';
      this.current = current;
    }
  }
  return {
    ProgressUnavailableError,
    ProgressConflictError,
    learningAPI: {
      getProgress: vi.fn(),
      updateProgress: vi.fn(),
      convertToProgressData: vi.fn(),
      getLocalProgressFallback: vi.fn(),
      saveLocalProgress: vi.fn(),
    },
  };
});

vi.mock('@/lib/learning-journey', () => ({
  getStoredLearningJourney: vi.fn(),
  getLearningJourney: vi.fn(),
}));

const mockCourse: Course = {
  id: 'course-1',
  title: 'Test Course',
  description: 'A test course',
  instructor: 'Test Instructor',
  credits: 3,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const mockJourney = {
  headline: 'Test Journey',
  levelLabel: 'Test Track',
  streakMessage: 'Keep going!',
  levels: [
    {
      id: 'level-1',
      title: 'Level 1',
      summary: 'First level',
      goal: 'Learn basics',
      tasks: [],
      resources: [],
    },
    {
      id: 'level-2',
      title: 'Level 2',
      summary: 'Second level',
      goal: 'Learn more',
      tasks: [],
      resources: [],
    },
  ],
};

describe('useRoadmapProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useUserStore.setState({
      learningPath: {
        currentCourse: null,
        completedModules: [],
        bookmarks: [],
        notes: [],
      },
    });

    vi.mocked(learningJourney.getLearningJourney).mockReturnValue(
      mockJourney
    );
    vi.mocked(learningJourney.getStoredLearningJourney).mockReturnValue(
      null
    );
  });

  it('initializes with loading state', () => {
    vi.mocked(learningAPI.getProgress).mockReturnValue(
      new Promise(() => {})
    );

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.nodes.length).toBeGreaterThan(0);
    expect(result.current.error).toBeNull();
  });

  it('fetches progress and builds roadmap on mount', async () => {
    vi.mocked(learningAPI.getProgress).mockResolvedValue({
      studentId: 'student-1',
      courseId: 'course-1',
      completedLessons: ['level-1'],
      currentModuleId: 'level-2',
      percentage: 50,
      status: 'in_progress',
      lastAccessedAt: null,
      completedAt: null,
    });

    vi.mocked(learningAPI.convertToProgressData).mockReturnValue({
      completedLessons: ['level-1'],
      currentModuleId: 'level-2',
      percentage: 50,
      status: 'in_progress',
      lastAccessedAt: null,
      completedAt: null,
    });

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.course).toBeTruthy();
    expect(result.current.courseTitle).toBe('Test Course');
  });

  it('handles API failure with local fallback', async () => {
    vi.mocked(learningAPI.getProgress).mockRejectedValue(
      new Error('Network error')
    );
    vi.mocked(
      learningAPI.getLocalProgressFallback
    ).mockReturnValue({
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
    });

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBeTruthy();
  });

  it('sets error when no fallback and API fails', async () => {
    vi.mocked(learningAPI.getProgress).mockRejectedValue(
      new Error('Network error')
    );
    vi.mocked(
      learningAPI.getLocalProgressFallback
    ).mockReturnValue(null);

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
  });

  it('selects a node', async () => {
    vi.mocked(learningAPI.getProgress).mockResolvedValue({
      studentId: 'student-1',
      courseId: 'course-1',
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
    });

    vi.mocked(learningAPI.convertToProgressData).mockReturnValue({
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
    });

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectNode('level-2');
    });

    expect(result.current.selectedNodeId).toBe('level-2');
  });

  it('updates node progress and reconciles with the server snapshot', async () => {
    vi.mocked(learningAPI.getProgress).mockResolvedValue({
      studentId: 'student-1',
      courseId: 'course-1',
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    vi.mocked(learningAPI.convertToProgressData).mockImplementation((r) => ({
      completedLessons: r.completedLessons,
      currentModuleId: r.currentModuleId ?? null,
      percentage: r.percentage,
      status: r.status,
      lastAccessedAt: r.lastAccessedAt ?? null,
      completedAt: r.completedAt ?? null,
      updatedAt: r.updatedAt ?? null,
    }));

    vi.mocked(learningAPI.updateProgress).mockResolvedValue({
      studentId: 'student-1',
      courseId: 'course-1',
      completedLessons: ['level-1'],
      currentModuleId: 'level-1',
      percentage: 50,
      status: 'in_progress',
      lastAccessedAt: null,
      completedAt: null,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateNodeProgress('level-1', true);
    });

    expect(result.current.progress?.completedLessons).toContain(
      'level-1'
    );
    expect(learningAPI.updateProgress).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({
        completedLessons: ['level-1'],
        baseUpdatedAt: '2026-01-01T00:00:00.000Z',
      })
    );
    // Reconciles with the server's fresh concurrency token.
    expect(result.current.progress?.updatedAt).toBe(
      '2026-01-02T00:00:00.000Z'
    );
  });

  it('rolls back the optimistic update when persistence fails', async () => {
    vi.mocked(learningAPI.getProgress).mockResolvedValue({
      studentId: 'student-1',
      courseId: 'course-1',
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
    });

    vi.mocked(learningAPI.convertToProgressData).mockImplementation((r) => ({
      completedLessons: r.completedLessons,
      currentModuleId: r.currentModuleId ?? null,
      percentage: r.percentage,
      status: r.status,
      lastAccessedAt: r.lastAccessedAt ?? null,
      completedAt: r.completedAt ?? null,
      updatedAt: r.updatedAt ?? null,
    }));

    vi.mocked(learningAPI.updateProgress).mockRejectedValue(
      new ProgressUnavailableError('learning service is temporarily unavailable')
    );

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateNodeProgress('level-1', true);
    });

    // A failed save must not leave the UI falsely marked complete (#901).
    expect(result.current.progress?.completedLessons).not.toContain(
      'level-1'
    );
    expect(result.current.error).toContain('temporarily unavailable');
  });

  it('rolls back the optimistic update when the API returns no saved progress', async () => {
    vi.mocked(learningAPI.getProgress).mockResolvedValue({
      studentId: 'student-1',
      courseId: 'course-1',
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
    });

    vi.mocked(learningAPI.convertToProgressData).mockImplementation((r) => ({
      completedLessons: r.completedLessons,
      currentModuleId: r.currentModuleId ?? null,
      percentage: r.percentage,
      status: r.status,
      lastAccessedAt: r.lastAccessedAt ?? null,
      completedAt: r.completedAt ?? null,
      updatedAt: r.updatedAt ?? null,
    }));

    vi.mocked(learningAPI.updateProgress).mockResolvedValue(null);

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateNodeProgress('level-1', true);
    });

    expect(result.current.progress?.completedLessons).not.toContain(
      'level-1'
    );
    expect(result.current.error).toBe('Progress could not be saved');
  });

  it('reconciles with the server state on a stale-update conflict', async () => {
    vi.mocked(learningAPI.getProgress).mockResolvedValue({
      studentId: 'student-1',
      courseId: 'course-1',
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    vi.mocked(learningAPI.convertToProgressData).mockImplementation((r) => ({
      completedLessons: r.completedLessons,
      currentModuleId: r.currentModuleId ?? null,
      percentage: r.percentage,
      status: r.status,
      lastAccessedAt: r.lastAccessedAt ?? null,
      completedAt: r.completedAt ?? null,
      updatedAt: r.updatedAt ?? null,
    }));

    vi.mocked(learningAPI.updateProgress).mockRejectedValue(
      new ProgressConflictError('Progress was updated in another session', {
        studentId: 'student-1',
        courseId: 'course-1',
        completedLessons: ['level-2'],
        currentModuleId: 'level-2',
        percentage: 50,
        status: 'in_progress',
        lastAccessedAt: null,
        completedAt: null,
        updatedAt: '2026-01-03T00:00:00.000Z',
      })
    );

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateNodeProgress('level-1', true);
    });

    // Deterministic conflict behavior: the server's state is authoritative.
    expect(result.current.progress?.completedLessons).toEqual(['level-2']);
    expect(result.current.error).toContain('another session');
  });

  it('handles null course', () => {
    const { result } = renderHook(() =>
      useRoadmapProgress(null)
    );

    expect(result.current.course).toBeNull();
    expect(result.current.nodes).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('returns overall progress from progress data', async () => {
    vi.mocked(learningAPI.getProgress).mockResolvedValue({
      studentId: 'student-1',
      courseId: 'course-1',
      completedLessons: [],
      currentModuleId: null,
      percentage: 35,
      status: 'in_progress',
      lastAccessedAt: null,
      completedAt: null,
    });

    vi.mocked(learningAPI.convertToProgressData).mockReturnValue({
      completedLessons: [],
      currentModuleId: null,
      percentage: 35,
      status: 'in_progress',
      lastAccessedAt: null,
      completedAt: null,
    });

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.overallProgress).toBe(35);
    });
  });

  it('refetches progress when refetch is called', async () => {
    const getProgressMock = vi
      .mocked(learningAPI.getProgress)
      .mockResolvedValue({
        studentId: 'student-1',
        courseId: 'course-1',
        completedLessons: [],
        currentModuleId: null,
        percentage: 0,
        status: 'not_started',
        lastAccessedAt: null,
        completedAt: null,
      });

    vi.mocked(learningAPI.convertToProgressData).mockReturnValue({
      completedLessons: [],
      currentModuleId: null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
    });

    const { result } = renderHook(() =>
      useRoadmapProgress(mockCourse)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    getProgressMock.mockClear();

    await act(async () => {
      await result.current.refetch();
    });

    expect(getProgressMock).toHaveBeenCalledWith('course-1');
  });
});
