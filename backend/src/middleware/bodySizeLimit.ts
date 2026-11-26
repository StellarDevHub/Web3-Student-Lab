import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

/**
 * Enforces a strict JSON body payload size limit.
 *
 * Rejects requests whose parsed JSON body exceeds the configured byte
 * threshold with a 413 Payload Too Large response.
 */

export const MAX_JSON_BODY_BYTES = 1_048_576; // 1MB

export function jsonBodySizeLimit(req: Request, res: Response, next: NextFunction): void {
  const contentLength = req.headers['content-length'];
  const receivedBytes = typeof contentLength === 'string' ? Number(contentLength) : 0;
  if (Number.isFinite(receivedBytes) && receivedBytes > MAX_JSON_BODY_BYTES) {
    res.status(413).json({
      status: 'error',
      message: `Payload too large. Maximum allowed size is ${MAX_JSON_BODY_BYTES} bytes.`,
      max_bytes: MAX_JSON_BODY_BYTES,
      received_bytes: receivedBytes,
    });
    return;
  }

  next();
}

/**
 * Converts body-parser failures (malformed JSON or express.json's byte limit)
 * into the same JSON error envelope used by the API.
 */
export const jsonBodyParsingErrorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  next,
) => {
  const bodyError = err as Error & {
    type?: string;
    status?: number;
    statusCode?: number;
  };

  if (!bodyError.type?.startsWith('entity.') &&
      bodyError.status !== 413 &&
      bodyError.statusCode !== 413) {
    return next(err);
  }

  if (bodyError.type === 'entity.too.large' ||
      bodyError.status === 413 ||
      bodyError.statusCode === 413) {
    const contentLength = req.headers['content-length'];
    const receivedBytes = typeof contentLength === 'string'
      ? Number(contentLength)
      : 0;

    res.status(413).json({
      status: 'error',
      message: `Payload too large. Maximum allowed size is ${MAX_JSON_BODY_BYTES} bytes.`,
      max_bytes: MAX_JSON_BODY_BYTES,
      received_bytes: Number.isFinite(receivedBytes) ? receivedBytes : undefined,
    });
    return;
  }

  res.status(400).json({
    status: 'error',
    message: 'Invalid JSON payload.',
  });
};
