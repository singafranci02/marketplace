-- Phase 29 — Reputation System: Agent Stakes + Enhanced Liquidity Score
-- Run in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Agent Stakes table ─────────────────────────────────────────────────────
-- Tracks SOL staked per agent in the platform's staking vault.
-- Used as W_stake in the Liquidity Score formula:
--   W_stake = min(1.0 + (staked_sol / 10.0), 2.0)
--
-- Phase 29: honor-system registration (no Anchor staking program yet).
-- Seed manually via SQL or a future POST /api/stake endpoint.
-- A future phase will verify on-chain PDA balances here.
CREATE TABLE IF NOT EXISTS agent_stakes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        TEXT UNIQUE NOT NULL,
  lamports_staked BIGINT NOT NULL DEFAULT 0,
  staked_at       TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_stakes_agent_id
  ON agent_stakes (agent_id);

-- ── Summary ───────────────────────────────────────────────────────────────────
--
-- Changes from Phase 29:
--   agent_stakes — maps agent_id → lamports_staked for W_stake multiplier
--
-- Liquidity Score Formula (applied in /api/agents and /api/agents/:id/reputation):
--   Score = (V_sol × S_success/S_total) + (T_active_bonus × W_stake)
--
-- Trust Tier (UNVERIFIED → ATTESTED → AUDITED → STAKED):
--   STAKED    : staked_sol > 0
--   AUDITED   : has SOC2/ISO27001 cert + on-chain volume > 0
--   ATTESTED  : has any compliance cert
--   UNVERIFIED: no cert, no volume
-- ─────────────────────────────────────────────────────────────────────────────
