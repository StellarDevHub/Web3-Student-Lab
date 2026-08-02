import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushQueuedLessonProgress,
  flushQueuedRequests,
  getQueuedLessonProgress,
  getQueuedRequests,
  queueLessonProgressCompletion,
  queueOfflineRequest,
  removeQueuedLessonProgress,
  removeQueuedRequest,
} from './offline-sync';

describe('offline-sync', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();

    const queued = await getQueuedRequests();
    for (const item of queued) {
      await removeQueuedRequest(item.id);
    }

    const progressItems = await getQueuedLessonProgress();
    for (const item of progressItems) {
      await removeQueuedLessonProgress(item.id);
    }
  });

  it('queues requests when offline and flushes when online', async () => {
    const request = {
      url: '/test-sync',
      method: 'POST' as const,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    };

    await queueOfflineRequest(request);
    let queuedRequests = await getQueuedRequests();
    expect(queuedRequests.length).toBe(1);
    expect(queuedRequests[0].url).toBe('/test-sync');

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await flushQueuedRequests();
    expect(fetchMock).toHaveBeenCalledWith('/test-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: request.body,
      credentials: 'same-origin',
    });

    queuedRequests = await getQueuedRequests();
    expect(queuedRequests.length).toBe(0);
  });

  it('queues lesson progress and flushes it when online', async () => {
    await queueLessonProgressCompletion({
      courseId: 'course-1',
      lessonId: 'lesson-1',
      completedAt: '2026-06-25T00:00:00.000Z',
    });

    let queuedProgress = await getQueuedLessonProgress();
    expect(queuedProgress).toHaveLength(1);
    expect(queuedProgress[0].id).toBe('course-1:lesson-1');

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await flushQueuedLessonProgress();

    expect(fetchMock).toHaveBeenCalledWith('/learning/courses/course-1/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        completedLessonId: 'lesson-1',
        completedAt: '2026-06-25T00:00:00.000Z',
      }),
    });

    queuedProgress = await getQueuedLessonProgress();
    expect(queuedProgress).toHaveLength(0);
  });
});
