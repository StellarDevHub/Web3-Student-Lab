import { AsyncLocalStorage } from 'node:async_hooks';
import { Request, Response, NextFunction } from 'express';

export const workspaceContextStorage = new AsyncLocalStorage<string>();

export const getWorkspaceId = (): string | undefined => {
  return workspaceContextStorage.getStore();
};

/**
 * Trusted, tenant-agnostic execution (BE-005). Code running inside
 * `runAsSystem` sets `app.bypass_rls = 'on'` on its transactions, so it can
 * read and write across workspaces. Reserve it for workers and admin jobs.
 */
const systemContextStorage = new AsyncLocalStorage<boolean>();

export const runAsSystem = <T>(fn: () => T): T => {
  return workspaceContextStorage.exit(() => systemContextStorage.run(true, fn));
};

export const isSystemContext = (): boolean => {
  return systemContextStorage.getStore() === true;
};

/** Run `fn` scoped to `workspaceId`, e.g. from a queue worker. */
export const runWithWorkspace = <T>(workspaceId: string, fn: () => T): T => {
  return systemContextStorage.exit(() => workspaceContextStorage.run(workspaceId, fn));
};

export const requireWorkspaceMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let workspaceId = (req.headers['x-workspace-id'] || req.query.workspaceId) as string;

  // Extract workspaceId from OAuth state parameter if present
  if (!workspaceId && req.query.state && typeof req.query.state === 'string') {
    const parts = req.query.state.split('__');
    if (parts.length === 2) {
      workspaceId = parts[0] as string;
    }
  }

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
  let workspaceId = (req.headers['x-workspace-id'] || req.query.workspaceId) as string;

  // Extract workspaceId from OAuth state parameter if present
  if (!workspaceId && req.query.state && typeof req.query.state === 'string') {
    const parts = req.query.state.split('__');
    if (parts.length === 2) {
      workspaceId = parts[0] as string;
    }
  }

  if (workspaceId) {
    workspaceContextStorage.run(workspaceId, () => {
      next();
    });
  } else {
    next();
  }
};
