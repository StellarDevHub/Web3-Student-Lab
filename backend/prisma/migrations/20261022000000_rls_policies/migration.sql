-- BE-005: Multi-tenant workspace isolation with PostgreSQL Row-Level Security.
--
-- Every tenant table carrying a "workspaceId" column only exposes (and only
-- accepts writes for) rows whose workspace matches the transaction-local
-- setting `app.current_workspace_id`. The Prisma RLS extension
-- (src/db/prismaMiddleware.ts) sets it with set_config(..., true), the
-- parameterised equivalent of `SET LOCAL`, so it can never leak to another
-- request sharing the pooled connection.
--
-- A session without that setting sees zero rows. Trusted system code (workers,
-- admin jobs) opts out explicitly with `app.bypass_rls = 'on'`.
--
-- FORCE ROW LEVEL SECURITY applies the policies to the table owner too, which
-- is usually the application role. Superusers and BYPASSRLS roles are never
-- subject to RLS, so production must connect as a regular role.
--
-- Rollback:
--   ALTER TABLE <t> NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS workspace_isolation ON <t>;
--   DROP FUNCTION IF EXISTS app_enable_workspace_rls(regclass), app_rls_bypassed(), app_current_workspace_id();

CREATE OR REPLACE FUNCTION app_current_workspace_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_workspace_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_rls_bypassed() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on' $$;

CREATE OR REPLACE FUNCTION app_enable_workspace_rls(target regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %s', target);
  EXECUTE format(
    'CREATE POLICY workspace_isolation ON %s '
    'USING (app_rls_bypassed() OR "workspaceId" = app_current_workspace_id()) '
    'WITH CHECK (app_rls_bypassed() OR "workspaceId" = app_current_workspace_id())',
    target
  );
END
$$;

-- Keep in sync with src/db/workspaceModels.ts (asserted by tests/rlsPolicies.test.ts).
DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'students',
    'courses',
    'certificates',
    'certificate_verification_events',
    'contributor_proofs',
    'decentralized_assets',
    'enrollments',
    'feedback',
    'ideas',
    'learning_progress',
    'audit_logs',
    'canvases',
    'notification_preferences',
    'p2p_nodes',
    'webhook_subscriptions',
    'translation_entries',
    'vesting_schedules'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = tenant_table
        AND column_name = 'workspaceId'
    ) THEN
      PERFORM app_enable_workspace_rls(format('%I', tenant_table)::regclass);
    ELSE
      RAISE NOTICE 'RLS: skipping % (table or "workspaceId" column not present)', tenant_table;
    END IF;
  END LOOP;
END
$$;
