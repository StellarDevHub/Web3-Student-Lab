import { NextFunction, Request, Response } from 'express';
import { runWithDbRoutingContext } from '../db/requestContext.js';

export const dbRoutingMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  runWithDbRoutingContext(req.method, () => {
    next();
  });
};
