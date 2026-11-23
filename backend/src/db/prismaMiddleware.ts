/**
 * Prisma Row-Level Security extension (BE-005).
 *
 * PostgreSQL RLS policies (prisma/migrations/20261022000000_rls_policies)
 * only expose rows whose "workspaceId" matches `app.current_workspace_id`.
 * This extension wraps every query against a workspace-scoped model in a
 * batch transaction whose first statement sets that value transaction-locally
 * (`set_config(..., true)` ≡ `SET LOCAL`), so tenant context is enforced by
 * the database engine and can never leak across pooled connections.
 *
 * Context resolution, per query:
 *  1. Workspace context (x-workspace-id → AsyncLocalStorage) → that workspace.
 *  2. `runAsSystem()` → `app.bypass_rls = 'on'`.
 *  3. Neither → `RLS_UNSCOPED_ACCESS`: `system` (default; keeps unscoped
 *     endpoints such as login working) or `deny` (no settings applied, the
 *     database returns zero rows).
 *
 * Interactive transactions must use {@link withWorkspaceTransaction}, which
 * sets the context once at the start of the transaction.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { getWorkspaceId, isSystemContext } from '../middleware/WorkspaceContext.js';
import { workspaceModels } from './workspaceModels.js';

export const WORKSPACE_SETTING = 'app.current_workspace_id';
export const BYPASS_SETTING = 'app.bypass_rls';

export type UnscopedAccess = 'system' | 'deny';

export interface RlsSettings {
  workspaceId: string;
  bypass: boolean;
}

/** Minimal base-client surface the extension needs (unextended PrismaClient). */
export interface RlsBaseClient {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): unknown;
  $transaction(operations: unknown[]): Promise<unknown[]>;
}

interface QueryParams {
  model?: string;
  operation?: string;
  args?: unknown;
  query: (args: unknown) => Promise<unknown>;
}

// Set while running inside withWorkspaceTransaction: the settings are already
// applied to the open transaction, so queries must not be re-wrapped.
const interactiveTransactionStorage = new AsyncLocalStorage<boolean>();

export const getUnscopedAccess = (): UnscopedAccess => {
  return process.env.RLS_UNSCOPED_ACCESS === 'deny' ? 'deny' : 'system';
};

/**
 * Settings to apply for the current async context, or `null` when nothing
 * should be set (the database then denies access to tenant rows).
 */
export const resolveRlsSettings = (unscoped: UnscopedAccess = getUnscopedAccess()): RlsSettings | null => {
  const workspaceId = getWorkspaceId();
  if (workspaceId) {
    return { workspaceId, bypass: false };
  }
  if (isSystemContext() || unscoped === 'system') {
    return { workspaceId: '', bypass: true };
  }
  return null;
};

const setContextStatement = (client: Pick<RlsBaseClient, '$executeRaw'>, settings: RlsSettings): unknown =>
  client.$executeRaw`SELECT set_config('app.current_workspace_id', ${settings.workspaceId}, TRUE), set_config('app.bypass_rls', ${settings.bypass ? 'on' : 'off'}, TRUE)`;

/** The `$allOperations` handler, exported separately for unit testing. */
export const createRlsQueryHandler = (base: RlsBaseClient) => {
  return async ({ model, args, query }: QueryParams): Promise<unknown> => {
    if (!model || !workspaceModels.has(model) || interactiveTransactionStorage.getStore()) {
      return query(args);
    }

    const settings = resolveRlsSettings();
    if (!settings) {
      return query(args);
    }

    const results = await base.$transaction([setContextStatement(base, settings), query(args)]);
    return results[results.length - 1];
  };
};

/**
 * Build the extension for a base client. `base` must be the *unextended*
 * client so the `set_config` statement is not itself intercepted.
 */
export const rowLevelSecurityExtension = (base: RlsBaseClient) => ({
  name: 'workspace-row-level-security',
  query: {
    $allModels: {
      $allOperations: createRlsQueryHandler(base),
    },
  },
});

interface InteractiveClient<Tx> {
  $transaction<R>(fn: (tx: Tx) => Promise<R>, options?: Record<string, unknown>): Promise<R>;
}

/**
 * Run an interactive transaction with the current workspace (or system)
 * context applied for its whole duration.
 */
export const withWorkspaceTransaction = <Tx extends Pick<RlsBaseClient, '$executeRaw'>, R>(
  client: InteractiveClient<Tx>,
  fn: (tx: Tx) => Promise<R>,
  options?: Record<string, unknown>
): Promise<R> => {
  const settings = resolveRlsSettings();
  return client.$transaction(async (tx) => {
    if (settings) {
      await setContextStatement(tx, settings);
    }
    return interactiveTransactionStorage.run(true, () => fn(tx));
  }, options);
};
