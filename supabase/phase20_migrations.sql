-- Phase 20 — Shippable Hardening Migrations
-- Run each block in the Supabase SQL Editor (https://supabase.com/dashboard)

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature D: ToS click-wrap
-- Record when the human owner accepted the Terms of Use before generating a key
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz;


-- ─────────────────────────────────────────────────────────────────────────────
-- Feature B: Encrypted IP content key delivery
-- Stores the AES-256-GCM encrypted content key (format: iv:authTag:ciphertext)
-- Released to licensees only after they hold a valid signed artifact
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ip_vault
  ADD COLUMN IF NOT EXISTS content_key_encrypted text;


-- ─────────────────────────────────────────────────────────────────────────────
-- Feature A: On-chain wallet display (Base Sepolia)
-- Links a vault entry to a licensor's on-chain wallet for balance verification
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ip_vault
  ADD COLUMN IF NOT EXISTS wallet_address text;


-- ─────────────────────────────────────────────────────────────────────────────
-- Feature C: Performance attestations
-- Stores Ed25519-signed PnL reports from licensees.
-- When pnl_eth crosses a performance_trigger threshold, rev_share_pct is updated
-- in ip_licenses.custom_terms automatically by /api/performance-attest.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_attestations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id           uuid        NOT NULL REFERENCES ip_licenses(id),
  licensee_agent_id    text        NOT NULL,
  pnl_eth              numeric     NOT NULL,
  rev_share_triggered  numeric,        -- new rev_share_pct if a trigger fired, else NULL
  signature            text        NOT NULL,  -- base64url Ed25519 sig over { license_id, pnl_eth, timestamp }
  created_at           timestamptz DEFAULT now()
);

-- Index for fast license-specific lookups
CREATE INDEX IF NOT EXISTS idx_perf_attest_license_id
  ON performance_attestations (license_id);
