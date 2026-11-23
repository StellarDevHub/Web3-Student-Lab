-- Create merkle_cohort_roots table for batch certificate verification
CREATE TABLE IF NOT EXISTS merkle_cohort_roots (
    cohort_id TEXT PRIMARY KEY,
    root_hash TEXT NOT NULL,
    anchored_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merkle_cohort_roots_cohort_id ON merkle_cohort_roots(cohort_id);
