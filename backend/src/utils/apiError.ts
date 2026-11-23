/**
 * Versioned API error envelope.
 *
 * Every handled error leaving the API is serialised through this module so
 * clients (students, the frontend, integrators) see exactly one shape:
 *
 *   {
 *     "error": {
 *       "version": "1",
 *       "code": "VALIDATION_FAILED",
 *       "message": "Request validation failed",
 *       "requestId": "e1f0…",
 *       "timestamp": "2026-01-01T00:00:00.000Z",
 *       "fieldErrors": [{ "field": "tier", "message": "Invalid enum value" }]
 *     }
 *   }
 *
 * The `message` is always safe for clients: internal failures are reduced to a
 * generic sentence, while the full error (stack included) is written to the
 * server log under the same `requestId` so the two can be correlated.
 */

import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import logger from './logger.js';

/** Envelope schema version. Bump only on a breaking shape change. */
export const ERROR_ENVELOPE_VERSION = '1';

/** Message returned to clients whenever the cause is a server-side fault. */
export const GENERIC_SERVER_MESSAGE = 'An unexpected error occurred. Please try again later.';

/**
 * Stable, machine-readable error codes. Clients should branch on these rather
 * than on HTTP status codes or message text.
 */
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** A single invalid field. Never contains the submitted value. */
export interface ApiFieldError {
  /** Dot-separated path, e.g. `payment.method`. */
  field: string;
  /** Human-readable reason the field was rejected. */
  message: string;
}

export interface ApiErrorBody {
  version: string;
  code: string;
  message: string;
  /** Correlation ID — matches the `X-Correlation-ID` response header. */
  requestId: string;
  timestamp: string;
  fieldErrors?: ApiFieldError[];
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

/** Default code for a status code that was not raised through {@link ApiError}. */
const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ERROR_CODES.BAD_REQUEST,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  422: ERROR_CODES.UNPROCESSABLE_ENTITY,
  429: ERROR_CODES.RATE_LIMITED,
  503: ERROR_CODES.SERVICE_UNAVAILABLE,
};

export function defaultCodeForStatus(statusCode: number): ErrorCode {
  return CODE_BY_STATUS[statusCode] ?? ERROR_CODES.INTERNAL_ERROR;
}

/**
 * Application error carrying everything the envelope needs.
 * Throw this (directly or via the static helpers) from routes and services.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode | string;
  readonly fieldErrors?: ApiFieldError[];
  /**
   * Whether `message` is safe to return verbatim. Defaults to true for 4xx and
   * false for 5xx, so internal details never reach clients by accident.
   */
  readonly expose: boolean;

  constructor(
    statusCode: number,
    message: string,
    options: {
      code?: ErrorCode | string;
      fieldErrors?: ApiFieldError[];
      expose?: boolean;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code ?? defaultCodeForStatus(statusCode);
    this.expose = options.expose ?? statusCode < 500;
    if (options.fieldErrors) this.fieldErrors = options.fieldErrors;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  static badRequest(message: string, fieldErrors?: ApiFieldError[]): ApiError {
    return new ApiError(400, message, {
      code: ERROR_CODES.BAD_REQUEST,
      ...(fieldErrors && { fieldErrors }),
    });
  }

  static validationFailed(message: string, fieldErrors: ApiFieldError[]): ApiError {
    return new ApiError(400, message, { code: ERROR_CODES.VALIDATION_FAILED, fieldErrors });
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, message, { code: ERROR_CODES.UNAUTHORIZED });
  }

  static forbidden(message = 'Insufficient permissions'): ApiError {
    return new ApiError(403, message, { code: ERROR_CODES.FORBIDDEN });
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message, { code: ERROR_CODES.NOT_FOUND });
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message, { code: ERROR_CODES.CONFLICT });
  }

  static rateLimited(message = 'Too many requests'): ApiError {
    return new ApiError(429, message, { code: ERROR_CODES.RATE_LIMITED });
  }

  static internal(message = GENERIC_SERVER_MESSAGE, cause?: unknown): ApiError {
    return new ApiError(500, message, { code: ERROR_CODES.INTERNAL_ERROR, expose: false, cause });
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Resolve the correlation ID for a request.
 *
 * Prefers the ID assigned by the request logger, then inbound trace headers,
 * and only generates one as a last resort so an error response is never
 * missing an ID.
 */
export function getRequestId(req: Request): string {
  const fromHeaders =
    (req.headers['x-correlation-id'] as string | undefined) ||
    (req.headers['x-request-id'] as string | undefined);

  return req.correlationId || fromHeaders || randomUUID();
}

/**
 * Build the envelope body. `message` is expected to already be client-safe.
 */
export function buildErrorEnvelope(input: {
  code: ErrorCode | string;
  message: string;
  requestId: string;
  fieldErrors?: ApiFieldError[];
  timestamp?: string;
}): ApiErrorEnvelope {
  return {
    error: {
      version: ERROR_ENVELOPE_VERSION,
      code: input.code,
      message: input.message,
      requestId: input.requestId,
      timestamp: input.timestamp ?? new Date().toISOString(),
      ...(input.fieldErrors && input.fieldErrors.length > 0 && { fieldErrors: input.fieldErrors }),
    },
  };
}

/**
 * Normalise any thrown value into { statusCode, envelope } and log the full
 * detail server-side under the same request ID.
 */
export function toErrorResponse(
  err: unknown,
  requestId: string,
  context: Record<string, unknown> = {}
): { statusCode: number; envelope: ApiErrorEnvelope } {
  const apiError = isApiError(err) ? err : null;
  const statusCode = apiError?.statusCode ?? 500;
  const code = apiError?.code ?? defaultCodeForStatus(statusCode);

  const rawMessage = err instanceof Error ? err.message : String(err);
  const clientMessage =
    apiError && apiError.expose
      ? apiError.message
      : statusCode < 500
        ? rawMessage
        : GENERIC_SERVER_MESSAGE;

  // Detailed, correlated server-side record — stack traces stay here.
  const logPayload = {
    requestId,
    code,
    statusCode,
    message: rawMessage,
    stack: err instanceof Error ? err.stack : undefined,
    ...context,
  };

  if (statusCode >= 500) {
    logger.error(`Request failed [${code}]`, logPayload);
  } else {
    logger.warn(`Request rejected [${code}]`, logPayload);
  }

  return {
    statusCode,
    envelope: buildErrorEnvelope({
      code,
      message: clientMessage,
      requestId,
      ...(apiError?.fieldErrors && { fieldErrors: apiError.fieldErrors }),
    }),
  };
}

/**
 * Send an envelope for `err`, always echoing the correlation ID as a header.
 */
export function sendErrorEnvelope(req: Request, res: Response, err: unknown): Response {
  const requestId = getRequestId(req);
  const { statusCode, envelope } = toErrorResponse(err, requestId, {
    method: req.method,
    path: req.originalUrl ?? req.url,
  });

  res.setHeader('X-Correlation-ID', requestId);
  return res.status(statusCode).json(envelope);
}
