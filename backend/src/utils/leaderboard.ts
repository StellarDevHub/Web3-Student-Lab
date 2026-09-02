/**
 * Real-Time Global Student Leaderboard with Redis Sorted Sets (#1134).
 *
 * Uses Redis sorted sets (ZADD/ZRANGE) for O(log N) leaderboard updates
 * and O(1) rank lookups. Supports global, course, and weekly leaderboards.
 *
 * Usage:
 *   import { leaderboard } from '../utils/leaderboard';
 *
 *   await leaderboard.updateScore('global', userId, score);
 *   const top = await leaderboard.getTop('global', 10);
 *   const rank = await leaderboard.getRank('global', userId);
 */

import { redisConnection } from './redis';

const LEADERBOARD_PREFIX = 'leaderboard:';
const TTL_SECONDS = 86400 * 90; // 90 days retention

class Leaderboard {
  /**
   * Update a user's score (sets if higher, keeps if lower).
   */
  async updateScore(
    board: string,
    userId: string,
    score: number,
  ): Promise<void> {
    const key = `${LEADERBOARD_PREFIX}${board}`;
    // ZADD NX = only set if new, XX = only update if exists, GT = only update if new score is greater
    await redisConnection.zadd(key, 'GT', String(score), userId);
    await redisConnection.expire(key, TTL_SECONDS);
  }

  /**
   * Increment a user's score by delta.
   */
  async incrementScore(
    board: string,
    userId: string,
    delta: number,
  ): Promise<number> {
    const key = `${LEADERBOARD_PREFIX}${board}`;
    const newScore = await redisConnection.zincrby(key, String(delta), userId);
    await redisConnection.expire(key, TTL_SECONDS);
    return Number(newScore);
  }

  /**
   * Get the top N users on a leaderboard.
   */
  async getTop(
    board: string,
    count: number = 10,
  ): Promise<Array<{ userId: string; score: number; rank: number }>> {
    const key = `${LEADERBOARD_PREFIX}${board}`;
    const results = await redisConnection.zrevrange(key, 0, count - 1, 'WITHSCORES');
    const entries: Array<{ userId: string; score: number; rank: number }> = [];
    for (let i = 0; i < results.length; i += 2) {
      entries.push({
        userId: results[i],
        score: Number(results[i + 1]),
        rank: entries.length + 1,
      });
    }
    return entries;
  }

  /**
   * Get a user's rank and score.
   */
  async getRank(
    board: string,
    userId: string,
  ): Promise<{ rank: number | null; score: number } | null> {
    const key = `${LEADERBOARD_PREFIX}${board}`;
    const rank = await redisConnection.zrevrank(key, userId);
    const score = await redisConnection.zscore(key, userId);
    if (rank === null || score === null) return null;
    return { rank: rank + 1, score: Number(score) };
  }

  /**
   * Get users around a specific rank (for "your position" view).
   */
  async getAround(
    board: string,
    userId: string,
    count: number = 5,
  ): Promise<Array<{ userId: string; score: number; rank: number }>> {
    const key = `${LEADERBOARD_PREFIX}${board}`;
    const userRank = await redisConnection.zrevrank(key, userId);
    if (userRank === null) return [];

    const start = Math.max(0, userRank - Math.floor(count / 2));
    const end = start + count - 1;
    const results = await redisConnection.zrevrange(key, start, end, 'WITHSCORES');

    const entries: Array<{ userId: string; score: number; rank: number }> = [];
    for (let i = 0; i < results.length; i += 2) {
      entries.push({
        userId: results[i],
        score: Number(results[i + 1]),
        rank: start + (i / 2) + 1,
      });
    }
    return entries;
  }

  /**
   * Get total number of users on a leaderboard.
   */
  async count(board: string): Promise<number> {
    return redisConnection.zcard(`${LEADERBOARD_PREFIX}${board}`);
  }

  /**
   * Remove a user from a leaderboard.
   */
  async remove(board: string, userId: string): Promise<void> {
    await redisConnection.zrem(`${LEADERBOARD_PREFIX}${board}`, userId);
  }
}

export const leaderboard = new Leaderboard();
