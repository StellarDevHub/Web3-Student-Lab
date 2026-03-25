import { Request, Response, NextFunction } from 'express';
import { User } from './types.js';
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}
/**
 * Middleware to authenticate requests using JWT token
 * Expects Authorization header with format: "Bearer <token>"
 */
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require it
 */
export declare const optionalAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=auth.middleware.d.ts.map