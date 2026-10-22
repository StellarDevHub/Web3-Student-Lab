# Backend Infrastructure Setup Guide

## Overview
This guide covers the four critical infrastructure improvements for the Web3 Student Lab backend:
- BE-022: Multi-Region Read Replica Routing & PgBouncer
- BE-023: AI Exercise Evaluation Service
- BE-024: Automated Backup & PITR with S3 Glacier
- BE-025: Real-Time SSE with Redis Pub/Sub

## BE-022: Multi-Region Read Replica Routing

### Architecture
- **Primary Database**: PostgreSQL in us-east (write operations)
- **Read Replicas**: PostgreSQL in us-east, eu-west, apac-sg (read operations)
- **Connection Pooler**: PgBouncer for transaction-level pooling

### Configuration
1. Update environment variables:
```bash
DATABASE_URL=postgresql://user:pass@primary-db:5432/web3_student_lab
DATABASE_REPLICA_US_URL=postgresql://user:pass@replica-us:5432/web3_student_lab
DATABASE_REPLICA_EU_URL=postgresql://user:pass@replica-eu:5432/web3_student_lab
DATABASE_REPLICA_APAC_URL=postgresql://user:pass@replica-apac:5432/web3_student_lab
```

2. Start multi-region setup:
```bash
docker-compose -f docker-compose.multi-region.yml up
```

3. Inject DatabaseRouter into services:
```typescript
constructor(private dbRouter: DatabaseRouter) {}

// For reads
const users = await this.dbRouter.executeRead(
  (db) => db.user.findMany()
);

// For writes
await this.dbRouter.executeWrite(
  (db) => db.user.create({ data: { ... } })
);
```

### Health Checks
```bash
curl http://localhost:3000/api/health/db-replicas
```

## BE-023: AI Exercise Evaluation Service

### Features
- OpenAI GPT-4 integration with streaming responses
- Prompt injection attack detection and sanitization
- Rubric-based scoring system
- Safe input validation (max 10,000 chars per input)

### Setup
1. Install dependencies:
```bash
npm install openai
```

2. Configure OpenAI API:
```bash
OPENAI_API_KEY=sk-...
```

3. Use the service:
```typescript
constructor(private aiService: AiExerciseEvaluatorService) {}

const evaluation = await this.aiService.evaluateExercise(
  "Create a simple smart contract",
  studentCodeString,
  ["Functionality", "Security", "Code Quality"]
);

// Response includes:
// - feedback: detailed evaluation text
// - score: overall 0-100 score
// - criteriaScores: individual criterion scores
// - stream: async iterable for streaming response
```

### Prompt Injection Protection
The service automatically:
- Detects common injection patterns
- Sanitizes suspicious keywords
- Limits input length to prevent token exhaustion
- Uses explicit system prompts to enforce evaluation rules

## BE-024: Automated Backup & PITR with S3 Glacier

### Features
- Full database backups with compression
- WAL (Write-Ahead Log) archiving for PITR
- Automatic archival to S3 Glacier for cold storage
- Point-in-time recovery to any timestamp

### Setup
1. Configure AWS credentials:
```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_BACKUP_BUCKET=web3-lab-backups
AWS_REGION=us-east-1
```

2. Create backup bucket:
```bash
aws s3 mb s3://web3-lab-backups
```

3. Use the backup service:
```typescript
constructor(private backupService: BackupRecoveryService) {}

// Enable PITR
await this.backupService.enablePITR();

// Create full backup
const backup = await this.backupService.createFullBackup();
// Returns: backupId, timestamp, size, location

// Archive old backups to Glacier (30+ days old)
const result = await this.backupService.archiveToGlacier(30);
// Returns: archivedCount, totalSize

// Restore to specific point in time
const restore = await this.backupService.restoreToPIT(new Date('2024-01-15T14:30:00Z'));
```

### Backup Schedule
```bash
# Add to crontab for daily backups
0 2 * * * /usr/local/bin/backup-runner.sh
```

## BE-025: Real-Time SSE with Redis Pub/Sub

### Architecture
- Replaces per-process memory with centralized Redis Pub/Sub
- Enables horizontal scaling across multiple instances
- Automatic reconnection with keepalive heartbeat

### Setup
1. Configure Redis:
```bash
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=...
INSTANCE_ID=instance-1
```

2. Inject service:
```typescript
constructor(private sseBroadcast: RedisSseBroadcastService) {}

// Register SSE client
@Get('/subscribe')
subscribe(@Res() res: Response) {
  const clientId = uuid();
  const channels = ['announcements', 'user-progress'];
  
  this.sseBroadcast.registerConnection(clientId, res, channels);
}

// Publish event to all instances
publishUpdate() {
  this.sseBroadcast.publishEvent('announcements', 'course-update', {
    courseId: '123',
    message: 'New material available'
  });
}

// Monitor connections
const stats = this.sseBroadcast.getStats();
// { totalConnections: 150, channelCount: 5, channels: {...} }
```

3. Start keepalive:
```typescript
// In AppModule constructor
constructor(private sse: RedisSseBroadcastService) {
  this.sse.startKeepalive(30000); // 30-second keepalive
}
```

### Client-Side Usage
```javascript
const eventSource = new EventSource('/api/subscribe');

eventSource.addEventListener('course-update', (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
});

eventSource.addEventListener('keepalive', () => {
  // Connection is alive
});
```

## Integration Testing

```bash
# Test all services
npm run test:integration

# Test database routing
npm run test:db-routing

# Test AI evaluation
npm run test:ai-evaluation

# Test backup/recovery
npm run test:backup-pitr

# Test SSE broadcasting
npm run test:sse-broadcast
```

## Monitoring & Observability

### Metrics
- Database replica lag and health status
- Backup size and completion time
- SSE active connections and message throughput
- Redis Pub/Sub message rate and latency

### Logging
All services log to structured JSON format:
```json
{
  "timestamp": "2024-01-15T14:30:00Z",
  "service": "DatabaseRouter",
  "level": "info",
  "message": "Initialized primary database and 3 read replicas"
}
```

## Troubleshooting

### Database Replica Lag
```bash
# Check replica status
curl http://localhost:3000/api/health/db-replicas

# Monitor WAL archive
tail -f /var/log/postgresql/postgresql.log
```

### Backup Failures
```bash
# Verify S3 permissions
aws s3 ls s3://web3-lab-backups

# Check WAL archiving
psql -c "SELECT * FROM pg_stat_archiver;"
```

### SSE Connection Issues
```bash
# Monitor Redis
redis-cli PUBSUB CHANNELS
redis-cli INFO stats

# Check instance health
curl http://localhost:3000/api/health/sse
```
