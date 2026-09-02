import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { ApiResponse } from '../utils/response.js';
import { ApiError, ApiFieldError, sendErrorEnvelope } from '../utils/apiError.js';

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

/**
 * Strip all HTML tags and trim whitespace from a string value.
 * Used to prevent stored-XSS from reaching the database or downstream
 * services before schema-level type validation runs.
 */
function sanitizeString(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
}

/**
 * Recursively sanitize every string leaf in an arbitrary object/array tree.
 * Non-string primitives (numbers, booleans, null) are returned unchanged.
 * Unknown object types that are not plain objects or arrays are returned as-is.
 */
function deepSanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map(deepSanitize);
  }

  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = deepSanitize(val);
    }
    return sanitized;
  }

  return value;
}

// ---------------------------------------------------------------------------
// General-purpose validateInput middleware
// ---------------------------------------------------------------------------

/**
 * General input validation guard applied globally or on individual routes.
 *
 * Responsibilities:
 *  1. Body size / type guard  – rejects non-object bodies so downstream
 *     handlers always receive a plain object (prevents prototype-pollution
 *     vectors and crashes caused by unexpected primitives).
 *  2. String sanitization     – strips HTML from every string value in
 *     req.body, req.params, and req.query before they reach route handlers.
 *  3. Parameter type coercion – numeric-looking URL params are coerced to
 *     numbers so route-level Zod schemas with z.number() work consistently.
 *
 * Route-specific schema validation is handled by the `validate()` factory
 * below; this middleware provides a baseline defence-in-depth layer.
 */
export function validateInput(req: Request, res: Response, next: NextFunction): void {
  // 1. Body type guard
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({
        ...ApiResponse.error('Invalid request body'),
        error: 'Request body must be a JSON object',
      });
      return;
    }

    // 2. Sanitize body strings
    req.body = deepSanitize(req.body) as Record<string, unknown>;
  }

  // 2b. Sanitize URL params strings
  if (req.params && typeof req.params === 'object') {
    for (const key of Object.keys(req.params)) {
      if (typeof req.params[key] === 'string') {
        req.params[key] = sanitizeString(req.params[key]);
      }
    }
  }

  // 2c. Sanitize query-string values
  if (req.query && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) {
      const val = req.query[key];
      if (typeof val === 'string') {
        req.query[key] = sanitizeString(val);
      }
    }
  }

  next();
}

// ---------------------------------------------------------------------------
// Schema-based validation factory (used by individual routes)
// ---------------------------------------------------------------------------

/**
 * Middleware factory that validates req.params + req.body against a Zod
 * schema.  On success the merged, parsed value is written back to req.body
 * so downstream handlers receive type-safe, coerced data.
 *
 * @example
 * router.post('/vesting', validate(createVestingScheduleSchema), handler);
 */

/**
 * Map Zod issues to envelope field errors.
 * Only the field path and the reason are exposed — never the submitted value.
 */
export const toFieldErrors = (error: z.ZodError): ApiFieldError[] =>
  error.issues.map((issue: z.ZodIssue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

// Validation middleware factory — emits the versioned error envelope.
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Route params and body are validated together; the merged result
      // replaces req.body so handlers read one typed object.
      const validatedData = schema.parse({ ...req.params, ...req.body });
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendErrorEnvelope(
          req,
          res,
          ApiError.validationFailed('Request validation failed', toFieldErrors(error))
        );
      }

      // Unexpected failure inside the schema itself — never leak the detail.
      return sendErrorEnvelope(req, res, ApiError.internal(undefined, error));
    }
  };
};

// ---------------------------------------------------------------------------
// Subscription schemas & derived middleware
// ---------------------------------------------------------------------------

// Subscription creation validation schema
export const subscriptionCreateSchema = z.object({
  tier: z.enum(['BASIC', 'PRO', 'ENTERPRISE']),
  billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  paymentMethod: z.string().min(1, 'Payment method is required'),
  autoRenew: z.boolean().optional().default(false),
});

// Subscription plan update validation schema
export const subscriptionUpdateSchema = z.object({
  tier: z.enum(['BASIC', 'PRO', 'ENTERPRISE']),
  name: z.string().min(1, 'Plan name is required'),
  description: z.string().min(1, 'Description is required'),
  price: z.number().positive('Price must be positive'),
  currency: z.string().min(1, 'Currency is required'),
  features: z.array(z.string()).min(1, 'At least one feature is required'),
  maxUsers: z.number().positive('Max users must be positive'),
  isActive: z.boolean(),
});

// Specific validation middleware
export const validateSubscriptionCreate = validate(subscriptionCreateSchema);
export const validateSubscriptionUpdate = validate(subscriptionUpdateSchema);
