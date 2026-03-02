-- Phase 22 — IP Trust Tiers
-- Run in the Supabase SQL Editor (https://supabase.com/dashboard)

-- ─────────────────────────────────────────────────────────────────────────────
-- Add trust_tier column to ip_vault
-- Values: 'UNVERIFIED' (default) | 'ATTESTED' | 'AUDITED'
-- UNVERIFIED: newly submitted, no performance data
-- ATTESTED:   at least one signed performance attestation filed for a license on this IP
-- AUDITED:    manually approved by platform admin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ip_vault
  ADD COLUMN IF NOT EXISTS trust_tier text DEFAULT 'UNVERIFIED';
