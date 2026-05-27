export const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  enableOfflineQueue: false,
};

export const cacheTTL = {
  user: {
    profile: 300, // 5 minutes
    progress: 180, // 3 minutes
    certificates: 600, // 10 minutes
  },
  courses: {
    list: 1800, // 30 minutes
    detail: 900, // 15 minutes
    curriculum: 1800, // 30 minutes
  },
  leaderboard: {
    global: 300, // 5 minutes
    weekly: 180, // 3 minutes
  },
};
