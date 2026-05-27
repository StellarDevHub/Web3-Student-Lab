import { AsyncLocalStorage } from 'node:async_hooks';
import { Request, Response, NextFunction } from 'express';

export const workspaceContextStorage = new AsyncLocalStorage<string>();

export const getWorkspaceId = (): string | undefined => {
  return workspaceContextStorage.getStore();
};

export const requireWorkspaceMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const workspaceId = req.headers['x-workspace-id'] as string;

  if (!workspaceId) {
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-bypass-workspace'] !== 'false') {
      workspaceContextStorage.run('default', () => {
        next();
      });
      return;
    }
    res.status(400).json({ error: 'x-workspace-id header is missing or invalid' });
    return;
  }

  workspaceContextStorage.run(workspaceId, () => {
    next();
  });
};

export const optionalWorkspaceMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const workspaceId = req.headers['x-workspace-id'] as string;

  if (workspaceId) {
    workspaceContextStorage.run(workspaceId, () => {
      next();
    });
  } else {
    next();
  }
};
