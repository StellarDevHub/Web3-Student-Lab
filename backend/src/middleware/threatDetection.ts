/**
 * Threat detection middleware (#1425 / BE-HARD-34).
 *
 * Scans request body / query / params / headers for common injection payloads
 * (SQL injection, XSS, prototype pollution), logs a **sanitized** security
 * event and streams the telemetry to Sentry. Detection is non-blocking — the
 * existing validation layer continues to reject malformed input downstream.
 */

import { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger.js';
import { redactSensitiveData } from '../utils/logSanitizer.js';
import { captureMessage } from '../utils/sentry.js';

export type ThreatType = 'sql_injection' | 'xss' | 'prototype_pollution';

export interface ThreatEvent {
  type: ThreatType;
  location: 'body' | 'query' | 'params' | 'headers';
  field: string;
  /** Sanitized snippet (secrets/PII already masked). */
  sample: string;
}

const PATTERNS: Array<{ type: ThreatType; patterns: RegExp[] }> = [
  {
    type: 'sql_injection',
    patterns: [
      /\bunion\b[\s\S]{0,30}\bselect\b/i,
      /\bor\b\s+1\s*=\s*1/i,
      /;\s*drop\s+table/i,
      /\bsleep\s*\(/i,
      /--\s/,
    ],
  },
  {
    type: 'xss',
    patterns: [/<script\b/i, /javascript:/i, /\bon(error|load|click)\s*=/i, /<iframe\b/i],
  },
  {
    type: 'prototype_pollution',
    patterns: [/__proto__/, /constructor\s*\.\s*prototype/, /\bprototype\b\s*\]/],
  },
];

const MAX_SAMPLE_LENGTH = 160;

function classify(value: string): ThreatType | null {
  for (const { type, patterns } of PATTERNS) {
    if (patterns.some((pattern) => pattern.test(value))) {
      return type;
    }
  }
  return null;
}

function scan(
  value: unknown,
  location: ThreatEvent['location'],
  field: string,
  out: ThreatEvent[],
): void {
  if (typeof value === 'string') {
    const type = classify(value);
    if (type) {
      out.push({
        type,
        location,
        field: field || '(root)',
        sample: String(redactSensitiveData(value)).slice(0, MAX_SAMPLE_LENGTH),
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, location, `${field}[${index}]`, out));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const path = field ? `${field}.${key}` : key;
      // Prototype-pollution is signalled by the key name itself.
      const keyType = classify(key);
      if (keyType) {
        out.push({ type: keyType, location, field: path, sample: key.slice(0, MAX_SAMPLE_LENGTH) });
      }
      scan(nested, location, path, out);
    }
  }
}

/** Collect all detected threats for a request (pure, side-effect free). */
export function detectThreats(req: Request): ThreatEvent[] {
  const threats: ThreatEvent[] = [];
  scan(req.body, 'body', '', threats);
  scan(req.query, 'query', '', threats);
  scan(req.params, 'params', '', threats);
  scan(req.headers, 'headers', '', threats);
  return threats;
}

declare global {
  namespace Express {
    interface Request {
      securityThreats?: ThreatEvent[];
    }
  }
}

export const threatDetection = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const threats = detectThreats(req);
    if (threats.length > 0) {
      req.securityThreats = threats;
      const path = req.originalUrl || req.url;
      logger.warn('Security: potential injection attempt detected', {
        method: req.method,
        path,
        ip: req.ip,
        threats,
      });
      captureMessage('Security: potential injection attempt detected', 'warning', {
        method: req.method,
        path,
        threats,
      });
    }
  } catch (error) {
    logger.warn('Threat detection middleware failed', error);
  }
  next();
};
