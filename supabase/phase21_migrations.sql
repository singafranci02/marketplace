-- Phase 21 — Three Hardening Prompts
-- Run each block in the Supabase SQL Editor (https://supabase.com/dashboard)

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature 1: On-Chain Mirror
-- Stores the Base Sepolia transaction hash and verification status per ledger row.
-- on_chain_status: 'OFF_CHAIN' (default) | 'PENDING_ON_CHAIN' | 'VERIFIED_ON_CHAIN'
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS tx_hash text;

ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS on_chain_status text DEFAULT 'OFF_CHAIN';
