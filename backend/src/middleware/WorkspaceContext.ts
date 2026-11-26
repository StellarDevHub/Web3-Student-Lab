import { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';

export class WorkspaceAuthorizationError extends Error {
  readonly statusCode = 403;
  readonly code = 'WORKSPACE_AUTHORIZATION_REQUIRED';

  constructor(message = 'Forbidden: authenticated workspace context is required') {
    super(message);
    this.name = 'WorkspaceAuthorizationError';
  }
}

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

const getHeaderWorkspaceId = (req: Request): string | undefined => {
  const header = req.headers['x-workspace-id'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  const queryValue = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  const value = headerValue || queryValue;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

export const requireWorkspaceMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let workspaceId = getHeaderWorkspaceId(req);

  // Extract workspaceId from OAuth state parameter if present
  if (!workspaceId && req.query.state && typeof req.query.state === 'string') {
    const parts = req.query.state.split('__');
    if (parts.length === 2) {
      workspaceId = parts[0] as string;
    }
  }

  if (!workspaceId) {
    res.status(403).json({
      error: 'Forbidden: x-workspace-id header is missing or invalid',
    });
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
  let workspaceId = getHeaderWorkspaceId(req);

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
