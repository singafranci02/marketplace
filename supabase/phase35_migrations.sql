-- Phase 35: Dispute Oracle & Challenge Window
-- Run in Supabase SQL Editor before deploying.

-- ── disputes ─────────────────────────────────────────────────────────────────
-- Stores every dispute filed against an ip_license.
-- status = 'OPEN'     → dispute is active; challenge window in effect
-- status = 'RESOLVED' → admin has resolved: resolution = REFUND_BUYER | RELEASE_SELLER

CREATE TABLE IF NOT EXISTS disputes (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id    TEXT         NOT NULL,           -- ip_licenses.id
  artifact_id   TEXT         NOT NULL,           -- DealArtifact.artifact_id
  task_id       TEXT         NOT NULL,           -- solana task_id (hex)
  reason        TEXT         NOT NULL,           -- why the dispute was filed
  evidence_ipfs TEXT,                            -- optional IPFS link to evidence
  dispute_hash  TEXT         NOT NULL,           -- sha256(reason + evidence_ipfs) hex, committed on-chain
  status        TEXT         NOT NULL DEFAULT 'OPEN',  -- OPEN | RESOLVED
  resolution    TEXT,                            -- null | REFUND_BUYER | RELEASE_SELLER
  on_chain_tx   TEXT,                            -- open_dispute Solana tx signature
  resolved_by   TEXT,                            -- admin identifier or "AUTO"
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_status     ON disputes (status);
CREATE INDEX IF NOT EXISTS idx_disputes_license_id ON disputes (license_id);
CREATE INDEX IF NOT EXISTS idx_disputes_task_id    ON disputes (task_id);
