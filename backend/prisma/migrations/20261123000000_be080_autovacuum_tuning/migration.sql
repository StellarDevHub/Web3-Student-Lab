-- BE-080: Aggressive non-blocking autovacuum tuning on high-churn tables
-- (AuditLog, AuthNonce, StudentActivity, WebAuthnChallenge, OAuthState, and Session if present).
--
-- PostgreSQL autovacuum acquires only a SHARE UPDATE EXCLUSIVE lock, which does
-- NOT block concurrent user-facing SELECT, INSERT, UPDATE, or DELETE queries.

-- AuditLog (audit_logs): frequent append/update churn
ALTER TABLE "audit_logs" SET (
  autovacuum_enabled = true,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_analyze_threshold = 50,
  autovacuum_vacuum_cost_delay = 2
);

-- AuthNonce (auth_nonces): high-churn short-lived authentication nonces
ALTER TABLE "auth_nonces" SET (
  autovacuum_enabled = true,
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 25,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_analyze_threshold = 25,
  autovacuum_vacuum_cost_delay = 2
);

-- StudentActivity (student_activities): frequent activity heatmap updates
ALTER TABLE "student_activities" SET (
  autovacuum_enabled = true,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_analyze_threshold = 50,
  autovacuum_vacuum_cost_delay = 2
);

-- WebAuthnChallenge (webauthn_challenges): single-use 60s TTL challenge nonces
ALTER TABLE "webauthn_challenges" SET (
  autovacuum_enabled = true,
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 25,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_analyze_threshold = 25,
  autovacuum_vacuum_cost_delay = 2
);

-- OAuthState (oauth_states): short-lived OAuth session states
ALTER TABLE "oauth_states" SET (
  autovacuum_enabled = true,
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 25,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_analyze_threshold = 25,
  autovacuum_vacuum_cost_delay = 2
);

-- Session (sessions): apply aggressive autovacuum if a sessions table exists
DO $$
BEGIN
  IF to_regclass('public.sessions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sessions SET (
      autovacuum_enabled = true,
      autovacuum_vacuum_scale_factor = 0.01,
      autovacuum_vacuum_threshold = 25,
      autovacuum_analyze_scale_factor = 0.01,
      autovacuum_analyze_threshold = 25,
      autovacuum_vacuum_cost_delay = 2
    )';
  END IF;
END $$;
