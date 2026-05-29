# Redis Distributed Caching Layer - Setup & Deployment Guide

## 📋 Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ and npm/pnpm
- Basic understanding of Redis and Docker networking

## 🚀 Quick Start (Development)

### 1. Clone and Setup

```bash
# Clone repository
git clone https://github.com/StellarDevHub/Web3-Student-Lab.git
cd Web3-Student-Lab

# Install dependencies
cd backend
npm install  # or pnpm install

# Copy environment template
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` for standalone Redis (default):

```bash
REDIS_MODE=standalone
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
```

### 3. Start Services

```bash
# From project root
docker-compose up -d

# Verify services are running
docker ps

# Check Redis connectivity
redis-cli -p 6380 ping  # Should return PONG
```

### 4. Start Backend

```bash
cd backend

# Development mode
npm run dev

# Production mode
npm run build
npm start
```

### 5. Verify Caching Layer

```bash
# Check health endpoint
curl http://localhost:8080/health

# Should show:
# {
#   "status": "ok",
#   "redis": "connected",
#   "redisMode": "standalone",
#   "blockHeaderListener": {...},
#   "cacheWarmer": {...}
# }

# Check cache metrics
curl http://localhost:8080/api/v1/cache/metrics
```

## 🔄 High Availability Setup (Sentinel)

### 1. Configure Environment

```bash
# Update .env
REDIS_MODE=sentinel
REDIS_SENTINELS=localhost:26379,localhost:26380
REDIS_SENTINEL_NAME=mymaster
```

### 2. Start Services

```bash
# Start with Sentinel nodes
docker-compose up -d redis redis-sentinel-1 redis-sentinel-2

# Wait for Redis to be ready
sleep 10

# Start backend
cd backend && npm run dev
```

### 3. Test Failover

```bash
# Stop primary Redis
docker stop web3-student-lab-redis

# Sentinel automatically promotes a replica (after 30s)
# Backend continues working with the new primary

# Restart Redis
docker start web3-student-lab-redis
```

## 🌍 Distributed Cluster Setup

### 1. Configure Environment

```bash
# Update .env
REDIS_MODE=cluster
REDIS_CLUSTER_NODES=localhost:6381,localhost:6382,localhost:6383
```

### 2. Start Redis Cluster Nodes

```bash
# Start cluster nodes
docker-compose up -d redis-cluster-1 redis-cluster-2 redis-cluster-3

# Wait for nodes to be ready
sleep 5

# Initialize cluster
docker run -it --network host redis:7-alpine redis-cli \
  --cluster create \
  127.0.0.1:6381 \
  127.0.0.1:6382 \
  127.0.0.1:6383 \
  --cluster-replicas 0 \
  --cluster-yes
```

### 3. Start Backend

```bash
cd backend && npm run dev
```

### 4. Test Cluster

```bash
# Check cluster info
redis-cli -p 6381 cluster info

# Check node status
redis-cli -p 6381 cluster nodes
```

## 📦 Production Deployment

### 1. Security Configuration

```bash
# Generate strong passwords
REDIS_PASSWORD=$(openssl rand -base64 32)
REDIS_SENTINEL_PASSWORD=$(openssl rand -base64 32)

# Update .env
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_SENTINEL_PASSWORD=${REDIS_SENTINEL_PASSWORD}
```

### 2. Update docker-compose.yml

Add password authentication:

```yaml
redis:
  command: redis-server --requirepass $REDIS_PASSWORD

redis-sentinel-1:
  command: redis-sentinel /etc/sentinel.conf --port 26379 --requirepass $REDIS_SENTINEL_PASSWORD
```

### 3. Resource Limits

```yaml
redis:
  deploy:
    resources:
      limits:
        memory: 512M
      reservations:
        memory: 256M
```

### 4. Persistent Storage

```yaml
redis:
  volumes:
    - /data/redis:/data
  command: redis-server --appendonly yes --dir /data
```

### 5. Monitoring & Logging

```yaml
redis:
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
```

## 🔍 Monitoring & Debugging

### Check Redis Connection

```bash
# Standalone
redis-cli -p 6379 ping

# Sentinel
redis-cli -p 26379 ping
redis-sentinel-get-master-addr-by-name mymaster

# Cluster
redis-cli -p 6381 cluster info
```

### View Logs

```bash
# Backend logs
docker logs web3-student-lab-backend

# Redis logs
docker logs web3-student-lab-redis

# Sentinel logs
docker logs web3-student-lab-sentinel-1
```

### Cache Metrics

```bash
# View cache performance
curl http://localhost:8080/api/v1/cache/metrics

# Reset cache metrics
curl -X POST http://localhost:8080/api/v1/cache/metrics/reset

# Monitor cache operations in real-time
redis-cli -p 6379 MONITOR
```

### Memory Usage

```bash
# Check Redis memory
redis-cli -p 6379 info memory

# Check specific key sizes
redis-cli -p 6379 MEMORY USAGE "cache:key:name"

# Get memory statistics
redis-cli -p 6379 MEMORY STATS
```

## 🧪 Testing

### Run Cache Tests

```bash
cd backend

# Run all cache tests
npm test cache-distributed.test.ts

# Run specific test
npm test -- cache-distributed.test.ts -t "CacheService"

# Run with coverage
npm test -- cache-distributed.test.ts --coverage
```

### Integration Tests

```bash
# Start services
docker-compose up -d

# Run integration tests
npm test -- --testMatch="**/tests/**/*.integration.test.ts"
```

## 🚨 Troubleshooting

### Redis Connection Fails

```bash
# Check if Redis is running
docker ps | grep redis

# Check Redis logs
docker logs web3-student-lab-redis

# Test connection
redis-cli -h localhost -p 6380 ping

# If timeout, increase connection wait time
# In RedisClient.ts, adjust retry strategy
```

### High Memory Usage

```bash
# Check memory limit
redis-cli -p 6379 CONFIG GET maxmemory

# Adjust maxmemory
redis-cli -p 6379 CONFIG SET maxmemory 512mb

# Check eviction policy
redis-cli -p 6379 CONFIG GET maxmemory-policy

# Set LRU eviction
redis-cli -p 6379 CONFIG SET maxmemory-policy allkeys-lru
```

### Cluster Node Failures

```bash
# Check cluster state
redis-cli -p 6381 cluster info

# Fix cluster issues
redis-cli -p 6381 cluster fix-dead-nodes

# Replicate slots if needed
redis-cli -p 6381 --cluster rebalance localhost:6381
```

### Sentinel Failover Issues

```bash
# Check Sentinel status
redis-cli -p 26379 SENTINEL masters

# Force failover
redis-cli -p 26379 SENTINEL failover mymaster

# Check master address
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
```

## 📊 Performance Tuning

### Optimize RPC Caching

```typescript
// In redis.config.ts, adjust TTLs
cacheTTL.blockchain.blockHeader = 5;      // Reduce for more frequent updates
cacheTTL.blockchain.accountBalance = 20;  // Balance between freshness and performance
```

### Enable Pipelining

```typescript
// In RedisClient.ts
enableAutoPipelining: true,
autoPipeliningIgnoredCommands: ['info', 'ping']
```

### Adjust Connection Pool

```bash
# In backend config
DB_POOL_MIN=10
DB_POOL_MAX=30
```

## 🔐 Security Checklist

- [ ] Strong Redis password configured
- [ ] Sentinel password configured
- [ ] Redis behind firewall (not exposed to public)
- [ ] Use TLS/SSL in production
- [ ] Enable RBAC for multi-user setups
- [ ] Regular password rotation
- [ ] Monitor access logs
- [ ] Use private networks for cluster nodes

## 📈 Scaling Considerations

### Vertical Scaling
- Increase Redis memory limit
- Allocate more CPU to Redis process
- Optimize data structure sizes

### Horizontal Scaling
- Add more cluster nodes
- Use read replicas for specific data
- Implement sharding strategy

### Load Balancing
- Use backend load balancer
- Distribute RPC cache loads
- Implement connection pooling

## 🔄 Maintenance Tasks

### Regular Backups

```bash
# Create Redis backup
docker exec web3-student-lab-redis redis-cli BGSAVE

# Copy backup
docker cp web3-student-lab-redis:/data/dump.rdb ./backups/
```

### Cache Cleanup

```bash
# Clear expired keys
redis-cli -p 6379 SCRIPT FLUSH

# Remove unused patterns
redis-cli -p 6379 DEL "old:pattern:*"
```

### Monitor Cluster Health

```bash
# Run health check daily
docker exec web3-student-lab-redis-cluster-1 redis-cli cluster info

# Check replication lag
redis-cli -p 6381 INFO replication
```

## 📚 Additional Resources

- [Redis Documentation](https://redis.io/documentation)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [ioredis Documentation](https://github.com/luin/ioredis/wiki)
- [Redis Cluster Tutorial](https://redis.io/topics/cluster-tutorial)
- [Redis Sentinel Guide](https://redis.io/topics/sentinel)

## 🤝 Support

For issues or questions:
1. Check the [REDIS_CACHING_GUIDE.md](./docs/REDIS_CACHING_GUIDE.md)
2. Review troubleshooting section above
3. Check application logs
4. Open an issue on GitHub

## 🎯 Next Steps

1. **Development**: Use standalone Redis for local testing
2. **Staging**: Deploy with Sentinel for HA testing
3. **Production**: Use Cluster mode with proper backups and monitoring
4. **Optimization**: Monitor metrics and adjust TTLs as needed
