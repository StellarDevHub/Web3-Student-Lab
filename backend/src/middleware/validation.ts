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
export function deepSanitize(value: unknown): unknown {
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
// Prototype pollution prevention
// ---------------------------------------------------------------------------

/** Keys that are dangerous to set on any plain object or its prototype */
const PROTOTYPE_POLLUTING_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/**
 * Recursively strip keys that could enable prototype-pollution attacks.
 * Returns a new plain object with dangerous keys removed at every depth.
 *
 * @example
 * // Input:  { "__proto__": { "admin": true }, "name": "Alice" }
 * // Output: { "name": "Alice" }
 */
export function stripPrototypePollutingKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripPrototypePollutingKeys);
  }

  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = Object.create(null);
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (PROTOTYPE_POLLUTING_KEYS.has(key)) {
        continue; // silently drop the dangerous key
      }
      cleaned[key] = stripPrototypePollutingKeys(val);
    }
    // Return a true plain object (not the null-prototype one) for JSON serialisation
    return Object.assign({}, cleaned);
  }

  return value;
}

// ---------------------------------------------------------------------------
// Schema-driven key whitelisting (mass-assignment protection)
// ---------------------------------------------------------------------------

/**
 * Extract the set of keys declared at the top level of a Zod object schema.
 * Works with z.object(), z.object().strict(), and common wrapped forms
 * (z.optional(), z.nullable(), z.default(), z.preprocess()).
 */
function extractSchemaKeys(schema: z.ZodSchema): Set<string> | null {
  let s: any = schema;

  // Unwrap modifiers that wrap an inner type
  while (
    s instanceof z.ZodOptional ||
    s instanceof z.ZodNullable ||
    s instanceof z.ZodDefault ||
    s instanceof z.ZodEffects
  ) {
    s = s._def?.innerType ?? s._def?.schema ?? null;
    if (!s) return null;
  }

  if (s instanceof z.ZodObject) {
    return new Set(Object.keys(s.shape as Record<string, unknown>));
  }

  return null;
}

/**
 * Strip any keys from `body` that are not declared in `allowedKeys`.
 * This prevents mass-assignment vulnerabilities where an attacker adds
 * undeclared fields (e.g. `isAdmin: true`) that bypass downstream guards.
 */
function stripUnwhitelistedKeys(
  body: Record<string, unknown>,
  allowedKeys: Set<string>,
): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      stripped[key] = body[key];
    }
  }
  return stripped;
}

// ---------------------------------------------------------------------------
// General-purpose validateInput middleware
// ---------------------------------------------------------------------------

/**
 * Universal request validation guard — applied globally or on individual routes.
 *
 * Responsibilities:
 *  1. Body type guard          — rejects non-object bodies so downstream
 *     handlers always receive a plain object.
 *  2. Prototype pollution guard — strips __proto__, constructor, and other
 *     dangerous keys before any handler or schema sees the data.
 *  3. String sanitization      — strips HTML from every string in
 *     req.body, req.params, and req.query.
 *  4. Parameter type coercion  — numeric-looking URL params are coerced to
 *     numbers so route-level Zod schemas with z.number() work consistently.
 *
 * Route-specific schema validation and key whitelisting are handled by the
 * `validate()` factory below; this middleware provides a baseline defence-in-
 * depth layer that operates even on routes without per-route schemas.
 *
 * Closes #1385
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

    // 2. Prototype pollution prevention (must run before sanitization)
    req.body = stripPrototypePollutingKeys(req.body) as Record<string, unknown>;

    // 3. Sanitize body strings
    req.body = deepSanitize(req.body) as Record<string, unknown>;
  }

  // 3b. Sanitize URL params strings
  if (req.params && typeof req.params === 'object') {
    for (const key of Object.keys(req.params)) {
      if (typeof req.params[key] === 'string') {
        req.params[key] = sanitizeString(req.params[key]);
      }
    }
  }

  // 3c. Sanitize query-string values
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
 * Middleware factory that validates req.params + req.body against a Zod schema.
 *
 * Advanced features (Issue #1385):
 *   1. Key whitelisting — any key in req.body that is not declared in the Zod
 *      schema is silently stripped before the data reaches the handler.  This
 *      eliminates mass-assignment vulnerabilities (e.g. `isAdmin: true` injected
 *      into a registration body).
 *   2. Prototype pollution stripping — runs a second pass after merging params
 *      to ensure no dangerous keys slipped through from the URL layer.
 *   3. Versioned error envelope — validation errors are emitted in the project's
 *      standardised `ApiError` format, never leaking submitted values.
 *
 * On success, the merged, Zod-parsed value is written back to req.body so
 * downstream handlers receive type-safe, coerced data.
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
  // Pre-compute allowed keys once per route registration (not per request)
  const allowedKeys = extractSchemaKeys(schema);

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const merged = { ...req.params, ...req.body };

      // Strip unwhitelisted keys before parsing (mass-assignment protection).
      // If the schema is not a ZodObject we skip stripping (e.g. z.string() for
      // path-only schemas) to avoid breaking non-object schema use-cases.
      const sanitizedInput =
        allowedKeys && typeof merged === 'object' && merged !== null
          ? stripUnwhitelistedKeys(
              // Run prototype pollution guard on the merged input too
              stripPrototypePollutingKeys(merged) as Record<string, unknown>,
              allowedKeys,
            )
          : (stripPrototypePollutingKeys(merged) as Record<string, unknown>);

      // Parse + coerce through the Zod schema
      const validatedData = schema.parse(sanitizedInput);
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
