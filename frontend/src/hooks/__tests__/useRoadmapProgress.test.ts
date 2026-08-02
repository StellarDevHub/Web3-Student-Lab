import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRoadmapProgress } from '../useRoadmapProgress';
import { learningAPI } from '@/lib/learning-api';
import * as learningJourney from '@/lib/learning-journey';
import { useUserStore } from '@/stores/userStore';
import type { Course } from '@/lib/api';

vi.mock('@/lib/learning-api', () => ({
  learningAPI: {
    getProgress: vi.fn(),
    updateProgress: vi.fn(),
    convertToProgressData: vi.fn(),
    getLocalProgressFallback: vi.fn(),
    saveLocalProgress: vi.fn(),
  },
}));

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

  it('updates node progress', async () => {
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

    expect(result.current.progress?.completedLessons).toContain(
      'level-1'
    );
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
