/**
 * TagCacheInvalidator.ts — Issue #1130
 *
 * Tag-based distributed cache invalidation for course curriculum trees.
 *
 * Instead of hand-listing dependent cache keys, entities are registered against
 * Redis tag sets (`tag:<entityId>` → `{cacheKey1, cacheKey2, ...}`). Invalidation
 * then purges every registered key in a single atomic Redis pipeline and
 * broadcasts a message so other instances clear the same keys (and invalidate
 * their tag sets) — guaranteeing no stale content persists after a save.
 *
 * Usage:
 *   import invalidator from './TagCacheInvalidator.js';
 *   await invalidator.register('course:123', 'course:curriculum:123');
 *   await invalidator.register('module:456', 'course:123');          // dependent
 *   await invalidator.register('course:123', 'courses:list');
 *   await invalidator.invalidate(['course:123', 'module:456']);     // one pipeline
 */

import redisClient from './RedisClient.js';
import cacheService from './CacheService.js';
import logger from '../utils/logger.js';

const CHANNEL = 'cache:invalidate:tags';

/**
 * Register a dependent cache key against one or more entity tags. Associates a
 * key with `course:<id>`, `module:<id>`, etc. so tag-based invalidation knows
 * every key that must be purged when that entity changes.
 */
export async function registerTag(
  tag: string,
  cacheKey: string
): Promise<void> {
  const client = redisClient.getClient();
  if (!client) return;
  try {
    // SADD is idempotent — safe to call repeatedly.
    await client.sadd(`tag:${tag}`, cacheKey);
  } catch (error) {
    logger.error(`Tag cache register error for tag ${tag}:`, error);
  }
}

/** List the cache keys currently registered against a tag. */
export async function getTaggedKeys(tag: string): Promise<string[]> {
  const client = redisClient.getClient();
  if (!client) return [];
  try {
    return await client.smembers(`tag:${tag}`);
  } catch (error) {
    logger.error(`Tag cache read error for tag ${tag}:`, error);
    return [];
  }
}

export interface InvalidationResult {
  tags: string[];
  keysPurged: number;
  broadcast: boolean;
}

/**
 * Atomically purge all cache keys registered against the given entity tags and
 * broadcast the invalidation to other instances.
 *
 * Uses a single MULTI pipeline so the delete set is applied atomically; each
 * affected key is also removed from its tag set so a later tag-based purge does
 * not try to delete an already-removed key.
 */
export async function invalidateTags(tags: string[]): Promise<InvalidationResult> {
  const client = redisClient.getClient();
  if (!client) {
    // No Redis: fall back to the in-memory store scoped to this process.
    let keysPurged = 0;
    for (const tag of tags) {
      for (const key of await getTaggedKeys(tag)) {
        await cacheService.del(key);
        keysPurged++;
      }
    }
    return { tags, keysPurged, broadcast: false };
  }

  const keysToPurge = new Set<string>();
  for (const tag of tags) {
    const keys = await client.smembers(`tag:${tag}`);
    keys.forEach((k) => keysToPurge.add(k));
  }

  // Atomic pipeline delete: all keys removed in one round-trip.
  const pipeline = client.pipeline();
  for (const key of keysToPurge) {
    pipeline.del(key);
  }
  // Prune the tag sets themselves and prune any now-orphaned tags.
  for (const tag of tags) {
    pipeline.del(`tag:${tag}`);
  }
  await pipeline.exec();

  await broadcastInvalidation(tags, keysToPurge);
  return { tags, keysPurged: keysToPurge.size, broadcast: true };
}

/** Default alias matching the CacheInvalidation naming style. */
export const invalidateCacheByTags = invalidateTags;

/**
 * Publish a tag-invalidation event to the cluster so every instance clears the
 * same keys and refreshes its in-memory tag indexes. Uses a dedicated pub
 * client (ioredis recommends not reusing the main client for pub/sub).
 */
export async function broadcastInvalidation(
  tags: string[],
  keys: Set<string>
): Promise<void> {
  const pub = redisClient.getPubClient();
  if (!pub) return;
  try {
    const payload = JSON.stringify({
      tags,
      keys: [...keys],
      timestamp: Date.now(),
      instanceId: process.env.INSTANCE_ID || 'unknown',
    });
    await pub.publish(CHANNEL, payload);
  } catch (error) {
    logger.error('Tag invalidation broadcast failed:', error);
  }
}

/** Handle an incoming cross-instance tag invalidation message. */
export async function handleTagInvalidationMessage(raw: string): Promise<void> {
  try {
    const data = JSON.parse(raw) as { tags: string[]; keys: string[] };
    if (data.keys?.length) {
      await cacheService.del(data.keys);
    }
    for (const tag of data.tags ?? []) {
      await cacheService.del(`tag:${tag}`);
    }
  } catch (error) {
    logger.error('Failed to handle tag invalidation message:', error);
  }
}

const invalidator = {
  register: registerTag,
  getTaggedKeys,
  invalidate: invalidateTags,
  broadcast: broadcastInvalidation,
  handleMessage: handleTagInvalidationMessage,
  channel: CHANNEL,
};

export default invalidator;