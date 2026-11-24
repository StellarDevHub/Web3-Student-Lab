-- Data retention stub for Issue #1610.
-- Intended to enforce GDPR/CCPA retention by removing stale refresh tokens,
-- rate-limit logs older than 7 days, and archived exercise attempts older than 1 year.

-- DELETE expired refresh tokens
-- DELETE FROM refresh_tokens WHERE expires_at < NOW();

-- TRUNCATE or purge old rate-limit logs
-- DELETE FROM rate_limit_logs WHERE created_at < NOW() - INTERVAL '7 days';

-- Archive completed exercise attempts older than 1 year
-- INSERT INTO archived_exercise_attempts (...)
-- SELECT ... FROM exercise_attempts WHERE completed_at < NOW() - INTERVAL '1 year';
-- DELETE FROM exercise_attempts WHERE completed_at < NOW() - INTERVAL '1 year';
