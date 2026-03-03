-- Phase 34: Trust Layer Hardening
-- Run in Supabase SQL Editor before deploying.

-- ── verification_results ──────────────────────────────────────────────────────
-- Stores the outcome of each VerificationScript run triggered by solana-listener.
-- status = 'PASS' → autoReleaseFunds() was called
-- status = 'FAIL' → license entered DISPUTED state

CREATE TABLE IF NOT EXISTS verification_results (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id   TEXT         NOT NULL,
  task_id       TEXT         NOT NULL,
  status        TEXT         NOT NULL,   -- 'PASS' | 'FAIL'
  script_hash   TEXT,                    -- verification_script_hash from artifact.terms
  artifact_hash TEXT,                    -- sha256(canonical_body) cross-check
  notes         TEXT,
  ran_at        TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ver_results_artifact ON verification_results (artifact_id);
CREATE INDEX IF NOT EXISTS idx_ver_results_task     ON verification_results (task_id);
CREATE INDEX IF NOT EXISTS idx_ver_results_status   ON verification_results (status);

-- ── ip_licenses: dispute window ───────────────────────────────────────────────
-- Added by Phase 34 verification gate.
-- Set to NOW + 24h when verification fails; SOL stays locked until expiry.

ALTER TABLE ip_licenses
  ADD COLUMN IF NOT EXISTS dispute_ends_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_licenses_dispute ON ip_licenses (dispute_ends_at)
  WHERE dispute_ends_at IS NOT NULL;
