# Detailed Logging System Documentation

## Overview

This document describes the enhanced logging system implemented for the Web3 Student Lab backend. The system provides structured logging with correlation IDs for distributed tracing, comprehensive request/response logging, and security-focused data sanitization.

## Features

### 1. Structured Logging with Winston

The logging system is built on Winston, a versatile logging library for Node.js. It provides:

- **Multiple log levels**: error, warn, info, debug
- **Multiple transports**: console, file (error.log, combined.log)
- **Structured JSON format** for production environments
- **Human-readable format** for development
- **Automatic log rotation** with size limits (5MB per file, keeping 5 files)
- **Exception and rejection handlers** for uncaught errors

### 2. Correlation IDs for Distributed Tracing

Correlation IDs enable tracking of requests across multiple services and components:

- **Automatic generation**: UUID v4 format for uniqueness
- **Header propagation**: Accepts `X-Correlation-ID` or `X-Request-ID` headers
- **Context tracking**: Maintains correlation ID throughout request lifecycle
- **Response headers**: Includes correlation ID in `X-Correlation-ID` response header

### 3. Detailed Request/Response Logging

The middleware captures comprehensive request and response details:

**Request Details:**
- HTTP method and URL
- Client IP address
- User agent
- Request headers (sanitized)
- Request body (sanitized)
- Query parameters
- Timestamp

**Response Details:**
- HTTP status code
- Request duration in milliseconds
- Content length and type
- Timestamp

### 4. Security-Focused Data Sanitization

Sensitive data is automatically redacted from logs:

**Sanitized Headers:**
- `authorization`
- `cookie`
- `x-api-key`
- `password`

**Sanitized Body Fields:**
- `password`
- `token`
- `secret`
- `apiKey`
- `privateKey`

### 5. Audit Logging

Immutable audit logs for compliance and security:

- Cryptographic SHA-256 hashing for integrity verification
- Separate immutable log file (`logs/audit-immutable.log`)
- Database storage for querying and UI display
- Correlation ID integration for traceability

## Architecture

### Logger Configuration

```typescript
// Main logger with structured format
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: structuredLogFormat,
  defaultMeta: {
    service: 'web3-student-lab-backend',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    // Console transport (human-readable)
    new winston.transports.Console({ ... }),
    // Error file transport
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Combined file transport
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});
```

### Correlation ID Management

```typescript
// Set correlation ID for current context
setCorrelationId('uuid-here');

// Get correlation ID from current context
const correlationId = getCorrelationId();

// Clear correlation ID from current context
clearCorrelationId();
```

### Child Logger Factory

Create child loggers with bound metadata:

```typescript
const childLogger = createChildLogger({
  component: 'UserService',
  userId: 'user-123',
});

childLogger.info('User action performed');
// Logs include: component, userId, correlationId, etc.
```

## Usage Examples

### Basic Logging

```typescript
import logger from './utils/logger.js';

logger.info('Server started');
logger.warn('High memory usage detected');
logger.error('Database connection failed', error);
logger.debug('Processing request', { requestId: '123' });
```

### Logging with Correlation ID

```typescript
import { setCorrelationId, clearCorrelationId } from './utils/logger.js';

// Set correlation ID at request start
setCorrelationId(req.headers['x-correlation-id']);

try {
  // Your business logic
  logger.info('Processing user request');
} finally {
  // Clear correlation ID after request completes
  clearCorrelationId();
}
```

### Using the Request Logger Middleware

```typescript
import { detailedRequestLogger } from './middleware/requestLogger.js';
import express from 'express';

const app = express();

// Add middleware before routes
app.use(detailedRequestLogger);

app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});
```

### Audit Logging

```typescript
import { logAudit, logRequestAudit } from './utils/audit.js';

// Manual audit logging
await logAudit({
  userId: 'user-123',
  action: 'USER_LOGIN',
  entity: 'User',
  entityId: 'user-123',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

// Audit logging from request
await logRequestAudit(req, 'USER_LOGIN', 'User', 'user-123');
```

## Log Format

### Console Format (Development)

```
2024-06-04 10:30:45.123 [abc-123-def] info: Incoming request {"method":"GET","url":"/api/users",...}
```

### JSON Format (Production)

```json
{
  "level": "info",
  "message": "Incoming request",
  "timestamp": "2024-06-04T10:30:45.123Z",
  "correlationId": "abc-123-def",
  "service": "web3-student-lab-backend",
  "environment": "production",
  "method": "GET",
  "url": "/api/users",
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0...",
  "headers": {...},
  "body": {...},
  "query": {...}
}
```

## Log Files

### File Structure

```
backend/logs/
├── error.log              # Error-level logs only
├── combined.log           # All logs (info, warn, error)
├── exceptions.log         # Uncaught exceptions
├── rejections.log         # Unhandled promise rejections
└── audit-immutable.log    # Immutable audit logs
```

### Log Rotation

- **Max file size**: 5MB
- **Max files**: 5 (10 for audit logs)
- **Rotation**: Automatic when size limit is reached

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- logger.test.ts
npm test -- requestLogger.test.ts
```

### Test Coverage

The logging system has comprehensive unit tests covering:

- Correlation ID management (set, get, clear)
- Structured logging at all levels
- Child logger creation and metadata binding
- Request/response logging middleware
- Data sanitization
- Audit logging
- Logger configuration

## Best Practices

### 1. Always Use Correlation IDs

```typescript
// Good
setCorrelationId(req.headers['x-correlation-id'] || generateUUID());
logger.info('Processing request');
clearCorrelationId();

// Bad
logger.info('Processing request'); // No correlation ID
```

### 2. Include Relevant Metadata

```typescript
// Good
logger.info('User created', { userId: '123', email: 'user@example.com' });

// Bad
logger.info('User created'); // Missing context
```

### 3. Use Appropriate Log Levels

- **error**: Errors that require immediate attention
- **warn**: Warning conditions that don't stop execution
- **info**: Normal operational information
- **debug**: Detailed diagnostic information

### 4. Sanitize Sensitive Data

The middleware automatically sanitizes sensitive data, but be mindful when logging manually:

```typescript
// Good
logger.info('User login attempt', { email: 'user@example.com' });

// Bad
logger.info('User login attempt', { 
  email: 'user@example.com',
  password: 'secret123' // Never log passwords!
});
```

### 5. Use Child Loggers for Components

```typescript
// Good
const userServiceLogger = createChildLogger({ component: 'UserService' });
userServiceLogger.info('User created');

// Bad
logger.info('UserService: User created'); // Harder to filter
```

## Troubleshooting

### Logs Not Appearing

1. Check log level: Ensure `LOG_LEVEL` environment variable is set appropriately
2. Check file permissions: Ensure the `logs/` directory is writable
3. Check transport configuration: Verify transports are correctly configured

### Correlation ID Not Propagating

1. Ensure middleware is added before routes
2. Check that correlation ID is set before logging
3. Verify correlation ID is cleared after request completes

### Performance Impact

The logging system is designed for minimal performance impact:

- Asynchronous file writes
- Efficient JSON serialization
- Minimal memory overhead
- Log rotation prevents disk space issues

## Security Considerations

1. **Never log sensitive data**: Passwords, tokens, API keys
2. **Use audit logging**: For compliance and security monitoring
3. **Protect log files**: Ensure proper file permissions
4. **Log rotation**: Prevent disk space exhaustion
5. **Correlation IDs**: Enable traceability without exposing user data

## Integration with Existing Systems

### Sentry Integration

The logging system integrates with Sentry for error tracking:

```typescript
import { initializeSentry } from './utils/sentry.js';

initializeSentry();
```

### Database Integration

Audit logs are stored in the database for querying:

```typescript
await prisma.auditLog.create({
  data: {
    userId: 'user-123',
    action: 'USER_LOGIN',
    // ... other fields
  },
});
```

## Future Enhancements

Potential improvements for the logging system:

1. **Log aggregation**: Integration with ELK stack or similar
2. **Real-time monitoring**: WebSocket-based log streaming
3. **Advanced filtering**: Query language for log searches
4. **Performance metrics**: Automatic performance tracking
5. **Custom log formats**: Pluggable formatters for different use cases

## References

- [Winston Documentation](https://github.com/winstonjs/winston)
- [Express Middleware Best Practices](https://expressjs.com/en/guide/writing-middleware.html)
- [OWASP Logging Guidelines](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

## Support

For issues or questions about the logging system:

1. Check this documentation
2. Review the test files for usage examples
3. Check the inline code comments
4. Open an issue in the repository

---

**Last Updated**: June 4, 2026
**Version**: 1.0.0
