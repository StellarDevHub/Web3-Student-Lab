# Redis Caching Layer Implementation

## Overview

This implementation provides a comprehensive Redis caching layer for the Web3 Student Lab backend API, improving performance by reducing database queries and response times.

## Architecture

### Multi-Level Caching Strategy

```
Request → Cache Middleware → Redis Cache → Database
                ↓                ↓
            Cache HIT        Cache MISS
                ↓                ↓
            Return Data    Fetch & Cache
```

## Features

- **Redis Integration**: Distributed caching with ioredis client
- **Cache Middleware**: Express middleware for automatic response caching
- **Cache Invalidation**: Event-based and pattern-based invalidation
- **Cache Metrics**: Hit/miss tracking and performance monitoring
- **Graceful Degradation**: Application continues if Redis is unavailable
- **Decorator Pattern**: Easy cache integration with `@Cacheable` decorator

## Installation

Install the required package:

```bash
npm install ioredis
npm install --save-dev @types/ioredis
```

## Configuration

### Environment Variables

Add to your `.env` file:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Docker Setup

Redis is included in `docker-compose.yml`:

```bash
docker compose up -d redis
```

## Usage

### Cache Middleware

Apply to GET routes for automatic caching:

```typescript
import { cacheMiddleware } from './cache/CacheMiddleware.js';
import { cacheTTL } from './config/redis.config.js';

router.get('/courses', cacheMiddleware({ ttl: cacheTTL.courses.list }), async (req, res) => {
  // Your route handler
});
```

### Cache Service

Direct cache operations:

```typescript
import cacheService, { CACHE_KEYS } from './cache/CacheService.js';

// Get from cache
const data = await cacheService.get(CACHE_KEYS.user.profile(userId));

// Set cache with TTL
await cacheService.set(CACHE_KEYS.user.profile(userId), userData, 300);

// Delete cache
await cacheService.del(CACHE_KEYS.user.profile(userId));
```

### Cache Invalidation

Invalidate cache on data mutations:

```typescript
import { invalidateUserCache, invalidateCourseCache } from './cache/CacheInvalidation.js';

// After updating user
await invalidateUserCache(userId);

// After updating course
await invalidateCourseCache(courseId);
```

## Cache Keys

Predefined cache key patterns:

```typescript
CACHE_KEYS.user.profile(userId)        // user:profile:{userId}
CACHE_KEYS.user.progress(userId)       // user:progress:{userId}
CACHE_KEYS.user.certificates(userId)   // user:certs:{userId}
CACHE_KEYS.courses.list()              // courses:list
CACHE_KEYS.courses.detail(courseId)    // course:{courseId}
CACHE_KEYS.courses.curriculum(courseId) // course:curriculum:{courseId}
```

## TTL Configuration

Default TTL values (in seconds):

- User Profile: 300s (5 minutes)
- User Progress: 180s (3 minutes)
- User Certificates: 600s (10 minutes)
- Courses List: 1800s (30 minutes)
- Course Detail: 900s (15 minutes)
- Course Curriculum: 1800s (30 minutes)

## Monitoring

### Cache Metrics Endpoint

```bash
GET /api/v1/cache/metrics
```

Response:
```json
{
  "redis": {
    "connected": true,
    "status": "healthy"
  },
  "cache": {
    "hits": 1250,
    "misses": 150,
    "hitRate": "89.29%"
  }
}
```

### Health Check

Redis status included in health endpoint:

```bash
GET /health
```

## Performance Targets

| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| GET /api/courses | 450ms | <50ms | 9x faster |
| GET /api/user/profile | 200ms | <30ms | 6x faster |
| GET /api/leaderboard | 800ms | <80ms | 10x faster |

**Target Cache Hit Rate**: >80%

## Testing

Run cache integration tests:

```bash
npm test tests/cache.test.ts
```

## Troubleshooting

### Redis Connection Issues

If Redis is unavailable, the application will:
1. Log a warning
2. Continue operating without cache
3. All cache operations will gracefully fail

### Cache Not Working

Check:
1. Redis is running: `docker compose ps`
2. Environment variables are set
3. Check logs for connection errors
4. Verify cache metrics endpoint

## Best Practices

1. **Always invalidate cache** after data mutations
2. **Use appropriate TTL** based on data volatility
3. **Monitor cache hit rate** regularly
4. **Test with Redis unavailable** to ensure graceful degradation
5. **Use cache keys consistently** via CACHE_KEYS constants

## Files Created

- `src/config/redis.config.ts` - Redis configuration
- `src/cache/RedisClient.ts` - Redis client singleton
- `src/cache/CacheService.ts` - Cache operations service
- `src/cache/CacheMiddleware.ts` - Express cache middleware
- `src/cache/CacheInvalidation.ts` - Cache invalidation utilities
- `src/cache/CacheMetrics.ts` - Metrics endpoint
- `src/decorators/Cacheable.ts` - Cache decorator
- `tests/cache.test.ts` - Integration tests
