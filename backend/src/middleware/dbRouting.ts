import { NextFunction, Request, Response } from 'express';
import { runWithDbRoutingContext } from '../db/requestContext.js';

/** Express middleware: GET requests are eligible for the read replica. */
export function dbRoutingMiddleware(req: Request, _res: Response, next: NextFunction): void {
  runWithDbRoutingContext(req.method, () => next());
}
