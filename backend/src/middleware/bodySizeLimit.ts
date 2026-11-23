import { Request, Response, NextFunction } from 'express';

/**
 * Enforces a strict JSON body payload size limit.
 *
 * Rejects requests whose parsed JSON body exceeds the configured byte
 * threshold with a 413 Payload Too Large response.
 */

const MAX_JSON_BODY_BYTES = 1_048_576; // 1MB

export function jsonBodySizeLimit(req: Request, res: Response, next: NextFunction): void {
  const contentLength = req.headers['content-length'];
  if (contentLength && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    res.status(413).json({
      status: 'error',
      message: `Payload too large. Maximum allowed size is ${MAX_JSON_BODY_BYTES} bytes.`,
      max_bytes: MAX_JSON_BODY_BYTES,
      received_bytes: Number(contentLength),
    });
    return;
  }

  next();
}
