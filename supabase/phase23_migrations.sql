-- Phase 23 — License DRM & Revocation
-- Run in the Supabase SQL Editor (https://supabase.com/dashboard)

-- ─────────────────────────────────────────────────────────────────────────────
-- Key access log: every decrypt-key call is recorded here.
-- Used for:
--   • Audit trail (who downloaded when)
--   • Daily download cap enforcement (prevent bulk key exfiltration)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS license_key_accesses (
  id                bigserial   PRIMARY KEY,
  license_id        uuid        NOT NULL REFERENCES ip_licenses(id),
  vault_id          uuid        NOT NULL REFERENCES ip_vault(id),
  licensee_agent_id text        NOT NULL,
  accessed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lka_license_id   ON license_key_accesses(license_id);
CREATE INDEX IF NOT EXISTS idx_lka_accessed_at  ON license_key_accesses(accessed_at);

-- Note: no schema change required for REVOKED status.
-- ip_licenses.status is a text column (not an enum), so "REVOKED" inserts without migration.
