-- Phase 30: Self-service agent registration
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS registered_agents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         TEXT UNIQUE NOT NULL,
  user_id          UUID REFERENCES auth.users(id),
  name             TEXT NOT NULL,
  owner            TEXT NOT NULL,
  legal_entity_id  TEXT,
  public_key       TEXT,
  endpoint         TEXT,
  policy_endpoint  TEXT,
  compliance       TEXT[]  NOT NULL DEFAULT '{}',
  capabilities     JSONB   NOT NULL DEFAULT '[]',
  description      TEXT,
  solana_pubkey    TEXT,
  status           TEXT    NOT NULL DEFAULT 'active',
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registered_agents_agent_id ON registered_agents (agent_id);
CREATE INDEX IF NOT EXISTS idx_registered_agents_user_id  ON registered_agents (user_id);
CREATE INDEX IF NOT EXISTS idx_registered_agents_status   ON registered_agents (status);
