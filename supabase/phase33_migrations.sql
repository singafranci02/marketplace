-- Phase 33: 2026 Agentic Protocol Upgrades
-- Run in Supabase SQL Editor

-- ── Part A: Agent-Led Auth ────────────────────────────────────────────────

-- Nonce table for wallet challenge/verify (replay attack prevention)
CREATE TABLE IF NOT EXISTS wallet_challenge_nonces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce      TEXT NOT NULL UNIQUE,
  pubkey     TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_nonces_pubkey  ON wallet_challenge_nonces (pubkey);
CREATE INDEX IF NOT EXISTS idx_wallet_nonces_expires ON wallet_challenge_nonces (expires_at);

-- Extend api_keys with wallet auth fields (backward compatible)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS solana_pubkey TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS auth_method   TEXT DEFAULT 'human';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_api_keys_solana_pubkey
  ON api_keys (solana_pubkey) WHERE solana_pubkey IS NOT NULL;

-- ── Part B: Intent Bulletin Board ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS buyer_intents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_agent_id      TEXT NOT NULL,
  ip_type             TEXT,                               -- null = any type accepted
  max_budget_lamports BIGINT NOT NULL,
  required_compliance TEXT[]    NOT NULL DEFAULT '{}',
  min_trust_tier      TEXT      NOT NULL DEFAULT 'UNVERIFIED',
  description         TEXT,
  deadline            TIMESTAMPTZ,
  status              TEXT      NOT NULL DEFAULT 'OPEN',  -- OPEN | MATCHED | WITHDRAWN | EXPIRED
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_buyer_intents_status  ON buyer_intents (status);
CREATE INDEX IF NOT EXISTS idx_buyer_intents_ip_type ON buyer_intents (ip_type);
CREATE INDEX IF NOT EXISTS idx_buyer_intents_created ON buyer_intents (created_at DESC);
