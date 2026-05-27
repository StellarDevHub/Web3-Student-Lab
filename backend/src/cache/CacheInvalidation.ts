import cacheService, { CACHE_KEYS } from './CacheService.js';

export const invalidateUserCache = async (userId: string): Promise<void> => {
  await cacheService.del([
    CACHE_KEYS.user.profile(userId),
    CACHE_KEYS.user.progress(userId),
    CACHE_KEYS.user.certificates(userId),
  ]);
};

export const invalidateCourseCache = async (courseId: string): Promise<void> => {
  await cacheService.del([
    CACHE_KEYS.courses.detail(courseId),
    CACHE_KEYS.courses.curriculum(courseId),
    CACHE_KEYS.courses.list(),
  ]);
};

export const invalidateUserProgressCache = async (userId: string): Promise<void> => {
  await cacheService.del(CACHE_KEYS.user.progress(userId));
};

export const invalidateLeaderboardCache = async (): Promise<void> => {
  await cacheService.del([CACHE_KEYS.leaderboard.global(), CACHE_KEYS.leaderboard.weekly()]);
};

export const invalidateAllCourses = async (): Promise<void> => {
  await cacheService.delPattern('course:*');
  await cacheService.del(CACHE_KEYS.courses.list());
};
