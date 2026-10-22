import { Injectable, Logger } from '@nestjs/common';
import * as winston from 'winston';

/**
 * BE-037: Structured JSON Logger with Sensitive PII Auto-Redaction & Masking Rules.
 * Automatically detects and masks authorization tokens, passwords, and PII before logging.
 */
@Injectable()
export class StructuredLoggerService {
  private logger: winston.Logger;
  private readonly redactionPatterns = [
    { pattern: /Bearer\s+[A-Za-z0-9_-]+/gi, mask: 'Bearer [REDACTED]' },
    { pattern: /authorization:\s*[^\s,}]+/gi, mask: 'authorization: [REDACTED]' },
    { pattern: /password['":\s]*[^\s,}]+/gi, mask: 'password: [REDACTED]' },
    { pattern: /api[_-]?key['":\s]*[^\s,}]+/gi, mask: 'api_key: [REDACTED]' },
    { pattern: /secret['":\s]*[^\s,}]+/gi, mask: 'secret: [REDACTED]' },
    { pattern: /credit[_-]?card['":\s]*[^\d\s-]/gi, mask: 'credit_card: [REDACTED]' },
    { pattern: /ssn['":\s]*[\d-]+/gi, mask: 'ssn: [REDACTED]' },
    { pattern: /email['":\s]*[\w.+-]+@[\w.-]+/gi, mask: 'email: [REDACTED]' },
    { pattern: /phone['":\s]*[\d\s\-()]+/gi, mask: 'phone: [REDACTED]' },
    { pattern: /oauth[_-]?token['":\s]*[^\s,}]+/gi, mask: 'oauth_token: [REDACTED]' },
    { pattern: /refresh[_-]?token['":\s]*[^\s,}]+/gi, mask: 'refresh_token: [REDACTED]' },
    { pattern: /private[_-]?key['":\s]*[^\s,}]+/gi, mask: 'private_key: [REDACTED]' },
    { pattern: /wallet[_-]?address['":\s]*0x[a-fA-F0-9]{40}/gi, mask: 'wallet_address: [REDACTED]' },
  ];

  constructor() {
    this.initializeLogger();
  }

  private initializeLogger(): void {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        ),
      }),
    ];

    // Add file transport in production
    if (process.env.NODE_ENV === 'production') {
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      );
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: {
        service: 'web3-student-lab',
        environment: process.env.NODE_ENV,
        version: process.env.APP_VERSION,
      },
      transports,
    });
  }

  /**
   * Redact sensitive information from text or objects
   */
  redactSensitiveData(data: any): any {
    if (typeof data === 'string') {
      return this.redactString(data);
    }

    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return data.map((item) => this.redactSensitiveData(item));
      }

      const redacted: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Redact by key name
        if (this.isSensitiveKey(key)) {
          redacted[key] = '[REDACTED]';
        } else {
          redacted[key] = this.redactSensitiveData(value);
        }
      }
      return redacted;
    }

    return data;
  }

  /**
   * Check if object key name indicates sensitive data
   */
  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'apiKey',
      'api_key',
      'authorization',
      'creditCard',
      'ssn',
      'privateKey',
      'private_key',
      'refreshToken',
      'accessToken',
      'oauthToken',
      'walletPrivateKey',
      'mnemonicPhrase',
    ];

    const keyLower = key.toLowerCase();
    return sensitiveKeys.some((sensitive) => keyLower.includes(sensitive));
  }

  /**
   * Redact string by applying patterns
   */
  private redactString(str: string): string {
    let redacted = str;

    for (const { pattern, mask } of this.redactionPatterns) {
      redacted = redacted.replace(pattern, mask);
    }

    return redacted;
  }

  /**
   * Log HTTP request with redacted sensitive data
   */
  logHttpRequest(method: string, url: string, headers: any, body?: any): void {
    const redactedHeaders = this.redactSensitiveData(headers);
    const redactedBody = this.redactSensitiveData(body);

    this.logger.info('HTTP Request', {
      method,
      url,
      headers: redactedHeaders,
      body: redactedBody,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log HTTP response with redacted sensitive data
   */
  logHttpResponse(statusCode: number, body?: any, duration?: number): void {
    const redactedBody = this.redactSensitiveData(body);

    this.logger.info('HTTP Response', {
      statusCode,
      body: redactedBody,
      duration,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log error with context
   */
  logError(error: Error, context: string, metadata?: any): void {
    const redactedMetadata = this.redactSensitiveData(metadata);

    this.logger.error('Error occurred', {
      context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      metadata: redactedMetadata,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log warning
   */
  logWarning(message: string, metadata?: any): void {
    const redactedMetadata = this.redactSensitiveData(metadata);

    this.logger.warn(message, {
      metadata: redactedMetadata,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log info
   */
  logInfo(message: string, metadata?: any): void {
    const redactedMetadata = this.redactSensitiveData(metadata);

    this.logger.info(message, {
      metadata: redactedMetadata,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log debug info
   */
  logDebug(message: string, metadata?: any): void {
    const redactedMetadata = this.redactSensitiveData(metadata);

    this.logger.debug(message, {
      metadata: redactedMetadata,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Audit log for security events
   */
  logAudit(action: string, actor: string, resource: string, result: 'success' | 'failure', metadata?: any): void {
    const redactedMetadata = this.redactSensitiveData(metadata);

    this.logger.info('Audit Log', {
      action,
      actor,
      resource,
      result,
      metadata: redactedMetadata,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Detect if content contains suspicious patterns
   */
  detectSuspiciousPatterns(content: string): { detected: boolean; patterns: string[] } {
    const suspicious: string[] = [];

    // Check for common suspicious patterns
    const suspiciousPatterns = [
      { name: 'SQL Injection', pattern: /('|("|%22))|(\*|%2A)|(-{2})|({3,})|[\\/]/i },
      { name: 'Script Injection', pattern: /<script|<iframe|javascript:|on\w+=/i },
      { name: 'Path Traversal', pattern: /\.\.\/|\.\.\\|\.\.\%2f|\.\.\%5c/i },
    ];

    for (const { name, pattern } of suspiciousPatterns) {
      if (pattern.test(content)) {
        suspicious.push(name);
      }
    }

    return {
      detected: suspicious.length > 0,
      patterns: suspicious,
    };
  }
}
