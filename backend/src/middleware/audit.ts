import { Request, Response, NextFunction } from 'express';
import { logRequestAudit } from '../utils/audit.js';

/**
 * Middleware to audit log an action
 * @param action The action name to log
 * @param entity The entity being acted upon
 */
export const auditAction = (action: string, entity?: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // We want to log AFTER the response is sent to know if it was successful
    const originalSend = res.send;

    res.send = function (body) {
      // Only log successful actions (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Try to extract entityId from params or body if not provided
        let entityId: string | undefined = req.params.id || req.body.id;

        if (!entityId && body) {
          try {
            const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
            entityId = parsedBody?.id;
          } catch (_e) {
            // ignore parse errors
          }
        }

        logRequestAudit(req, action, entity, entityId, {
          method: req.method,
          path: req.path,
          query: req.query,
          // Avoid logging sensitive body data if needed, but for audit we usually want some details
          body: action.includes('LOGIN') ? { email: req.body.email } : req.body,
        }).catch((err) => console.error('Audit middleware error:', err));
      }

      return originalSend.apply(res, [body]);
    };

    next();
  };
};
