# Distributed Caching Layer with Redis - Implementation Guide

## 🚀 Overview

This document details the implementation of a distributed caching layer using Redis for the Web3 Student Lab backend. The system is designed to handle high-frequency blockchain data queries without hitting RPC node rate limits.

## 📋 Key Features

### 1. **Multi-Mode Redis Support**
- **Standalone Mode**: Simple single-node Redis (development)
- **Sentinel Mode**: High availability with automatic failover
- **Cluster Mode**: Distributed caching across multiple nodes for horizontal scaling

### 2. **Smart Cache Invalidation**
- Block header-based automatic cache invalidation
- Pattern-based cache deletion for related data
- Event-driven invalidation through pub/sub

### 3. **RPC Call Interception**
- Transparent caching of Soroban RPC responses
- Automatic cache key generation based on method and parameters
- TTL configuration per RPC method type

### 4. **Distributed Cache Warming**
- Proactive cache population before peak usage
- Configurable warming intervals
- Support for user, course, and blockchain-specific data

### 5. **Comprehensive Monitoring**
- Cache hit/miss metrics
- Performance statistics across cluster
- Memory usage tracking
- Health check endpoints

## 🏗️ Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Backend Application                     │
├─────────────────────────────────────────────────────────────┤
│                    RPC Interceptor Middleware                │
│  (Intercepts & caches RPC calls before hitting nodes)       │
├─────────────────────────────────────────────────────────────┤
│  CacheService         BlockHeaderListener    CacheWarmer    │
│  (Get/Set/Delete)     (Invalidation Trigger) (Pre-populate) │
├─────────────────────────────────────────────────────────────┤
│         DistributedCacheManager (Cluster Coordination)       │
├─────────────────────────────────────────────────────────────┤
│                         Redis Client                         │
│        (Supports Standalone/Sentinel/Cluster modes)         │
└─────────────────────────────────────────────────────────────┘
         │
         └────────► Redis Instance(s)
```

## 📦 New Files Added

### Configuration
- **`src/config/redis.config.ts`** - Enhanced with clustering, sentinel, and TTL configs

### Cache Layer
- **`src/cache/RedisClient.ts`** - Cluster/Sentinel-aware Redis client
- **`src/cache/BlockHeaderListener.ts`** - Monitors new blocks for cache invalidation
- **`src/cache/RPCInterceptor.ts`** - Middleware for caching RPC calls
- **`src/cache/CacheWarmer.ts`** - Proactive cache population
- **`src/cache/DistributedCacheManager.ts`** - Cluster coordination
- **`src/cache/CacheService.ts`** - Enhanced with blockchain-specific methods

### Infrastructure
- **`redis-sentinel.conf`** - Sentinel configuration for HA
- **`docker-compose.yml`** - Updated with Redis Sentinel and Cluster nodes

## 🔧 Configuration

### Environment Variables

```bash
# Redis Mode (standalone, sentinel, cluster)
REDIS_MODE=standalone

# Standalone Mode
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional-password

# Sentinel Mode
REDIS_SENTINELS=sentinel-1:26379,sentinel-2:26380,sentinel-3:26381
REDIS_SENTINEL_NAME=mymaster
REDIS_SENTINEL_PASSWORD=optional-password

# Cluster Mode
REDIS_CLUSTER_NODES=node-1:6381,node-2:6382,node-3:6383

# Cache Warming
CACHE_WARMING_INTERVAL=300000  # 5 minutes
BLOCK_POLL_INTERVAL=10000      # 10 seconds

# Instance Identification
INSTANCE_ID=backend-1
```

## 🚀 Usage Examples

### 1. **Basic Cache Operations**

```typescript
import cacheService, { CACHE_KEYS } from './cache/CacheService';
import { cacheTTL } from './config/redis.config';

// Cache user profile
await cacheService.set(
  CACHE_KEYS.user.profile(userId),
  userData,
  cacheTTL.user.profile
);

// Retrieve cached data
const cachedUser = await cacheService.get(CACHE_KEYS.user.profile(userId));
```

### 2. **Blockchain-Specific Caching**

```typescript
// Cache account balance
await cacheService.cacheAccountData(address, balanceData, 30);

// Cache contract state
await cacheService.cacheContractState(contractId, state, 60);

// Cache transaction status
await cacheService.cacheTransactionStatus(txHash, status, 120);
```

### 3. **RPC Call Interception**

```typescript
import { rpcCacheMiddleware } from './cache/RPCInterceptor';

// In your Express app
app.use('/api/rpc', rpcCacheMiddleware);
```

### 4. **Block Header Monitoring**

```typescript
import blockHeaderListener from './cache/BlockHeaderListener';

// Start listening for new blocks
await blockHeaderListener.start();

// Register callback for new blocks
blockHeaderListener.onNewBlockDetected(async (blockHeight) => {
  console.log(`New block: ${blockHeight}`);
  // Custom invalidation logic
});

// Check status
const status = blockHeaderListener.getStatus();
```

### 5. **Cache Warming**

```typescript
import cacheWarmer from './cache/CacheWarmer';

// Start periodic warming
await cacheWarmer.start();

// Warm specific caches
await cacheWarmer.warmUserCaches(userIds);
await cacheWarmer.warmCourseCaches(courseIds);
```

### 6. **Distributed Cache Management**

```typescript
import distributedCacheManager from './cache/DistributedCacheManager';

// Publish invalidation across cluster
await distributedCacheManager.publishCacheInvalidation('user:*');

// Get cluster statistics
const stats = await distributedCacheManager.getCacheStatistics();
console.log(`Cache hit rate: ${stats.hitRate}%`);
console.log(`Memory usage: ${stats.memoryUsage}`);
```

## 📊 Cache Keys Structure

### User Data
```
user:profile:{userId}          # User profile info
user:progress:{userId}         # Learning progress
user:certs:{userId}           # Certificates
user:onchain:{userId}         # On-chain user data
```

### Blockchain Data
```
blockchain:latest-block       # Latest block info
blockchain:block:{height}     # Block by height
account:{address}            # Account data
account:balance:{address}    # Account balance
contract:state:{contractId}  # Contract state
contract:data:{contractId}:{key}  # Specific contract data
transaction:{txHash}         # Full transaction
transaction:status:{txHash}  # Transaction status
token:metadata:{tokenId}     # Token metadata
```

### RPC Calls
```
rpc:{method}:{params_hash}   # Cached RPC response
```

## 🔄 Cache Invalidation Strategies

### 1. **Block-Based Invalidation**
Triggered when new blocks are detected:
- Invalidates all blockchain-related caches
- Account and contract state caches cleared
- Transaction status caches updated

### 2. **Pattern-Based Invalidation**
```typescript
// Invalidate all user caches
await cacheService.delPattern('user:*');

// Invalidate all blockchain caches
await cacheService.invalidateBlockchainCache();
```

### 3. **Explicit Invalidation**
```typescript
// Invalidate specific user
await invalidateUserCache(userId);

// Invalidate specific course
await invalidateCourseCache(courseId);
```

## 📈 Performance Benefits

### RPC Rate Limit Reduction
- **Without caching**: 100 requests → 100 RPC calls
- **With caching (30s TTL)**: 100 requests → ~3-5 RPC calls

### Response Time Improvement
- Cache hits: ~10-50ms response time
- RPC calls: ~500-2000ms response time
- **Average improvement**: 90-95% faster responses

### Bandwidth Savings
- Reduced network traffic to RPC nodes
- Smaller payload sizes for cached responses
- Less database load from repeated queries

## 🛠️ Docker Compose Setup

### Start Services
```bash
# Standalone mode (development)
docker-compose up

# Scale with Sentinel (high availability)
# Ensure REDIS_MODE=sentinel in backend environment
docker-compose up

# Scale with Cluster (distributed)
# Ensure REDIS_MODE=cluster in backend environment
docker-compose up
```

### Initialize Redis Cluster
```bash
# One-time cluster initialization
docker exec web3-student-lab-redis-cluster-1 redis-cli --cluster create \
  127.0.0.1:6381 127.0.0.1:6382 127.0.0.1:6383 \
  --cluster-replicas 0 --cluster-yes
```

## 📊 Monitoring Endpoints

### Cache Metrics
```
GET /api/cache/metrics

Response:
{
  "redis": {
    "connected": true,
    "status": "healthy",
    "mode": "standalone"
  },
  "cache": {
    "hits": 1250,
    "misses": 85,
    "hitRate": "93.63%"
  }
}
```

### Reset Metrics
```
POST /api/cache/metrics/reset
```

## 🔍 Health Checks

The caching layer includes automatic health checks:

```typescript
// Check Redis connection
redisClient.isHealthy();

// Get connection info
await redisClient.getConnectionInfo();

// Get cache status
const status = blockHeaderListener.getStatus();
const warmingStatus = cacheWarmer.getStatus();
```

## 🚨 Error Handling & Fallback

The caching layer gracefully handles Redis failures:

1. **Connection Loss**: Falls back to in-memory store
2. **Timeout**: Returns null instead of blocking
3. **Cluster Node Failure**: Automatic failover (cluster mode)
4. **Sentinel Failure**: Continues monitoring with remaining sentinels

## 📈 TTL Configuration

Default TTLs for different data types:

```typescript
// Blockchain data - updates frequently
blockHeader: 10 seconds
accountBalance: 30 seconds
contractState: 60 seconds
transactionStatus: 120 seconds
tokenMetadata: 1 hour

// User data
profile: 5 minutes
progress: 3 minutes
certificates: 10 minutes
onChainData: 1 minute

// Static data
courses: 30 minutes
leaderboard: 5 minutes
```

## 🔐 Security Considerations

1. **Password Protection**: Use `REDIS_PASSWORD` for production
2. **Network Isolation**: Keep Redis on private networks
3. **Encryption**: Use TLS/SSL in production (not in docker-compose)
4. **Access Control**: Use Sentinel password and cluster authentication
5. **Data Sensitivity**: Don't cache sensitive user data longer than necessary

## 🐛 Troubleshooting

### Redis not connecting
```bash
# Check Redis status
docker logs web3-student-lab-redis

# Verify connection
redis-cli -h localhost -p 6379 ping
```

### High memory usage
- Adjust `maxmemory` in Redis config
- Reduce TTL values for less critical data
- Enable eviction policies: `maxmemory-policy`

### Cluster node issues
```bash
# Check cluster status
redis-cli -p 6381 cluster info

# Fix cluster
redis-cli -p 6381 cluster fix-dead-nodes
```

## 📚 Related Documentation

- [Redis Documentation](https://redis.io/documentation)
- [ioredis Client Library](https://github.com/luin/ioredis)
- [Redis Cluster Tutorial](https://redis.io/topics/cluster-tutorial)
- [Redis Sentinel Documentation](https://redis.io/topics/sentinel)

## 🤝 Contributing

When adding new features to the caching layer:

1. Add new cache keys to `CACHE_KEYS` in `CacheService.ts`
2. Define TTLs in `redis.config.ts`
3. Add invalidation strategy in `CacheInvalidation.ts`
4. Document the cache behavior in this guide
5. Add corresponding tests in `tests/cache.test.ts`
