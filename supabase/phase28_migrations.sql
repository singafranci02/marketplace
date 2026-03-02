-- Phase 28 — Solana Pivot: cNFT Token-Gating, Referrals, Liquidity Score
-- Run in the Supabase SQL Editor (https://supabase.com/dashboard)
--
-- Also deploy the Anchor program BEFORE running this migration:
--   cd programs/a2a-clearinghouse
--   anchor build
--   anchor deploy --provider.cluster devnet
--   → copy program ID to dashboard/.env.local: A2A_CLEARINGHOUSE_PROGRAM_ID=<pubkey>
--   → start listener: npm run listener
--
-- New env vars required in dashboard/.env.local:
--   SOLANA_RPC_URL=https://api.devnet.solana.com
--   A2A_CLEARINGHOUSE_PROGRAM_ID=<deployed program pubkey>
--   PLATFORM_SOLANA_KEYPAIR=<base58 secret key for cNFT minting + referral payouts>
--   MERKLE_TREE_ADDRESS=<Metaplex Merkle tree pubkey>
--
-- Removed env vars (no longer needed):
--   BASE_SEPOLIA_RPC_URL
--   A2A_CLEARINGHOUSE_ADDRESS
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. cNFT token-gating fields on ip_licenses ────────────────────────────────
-- cnft_asset_id : Metaplex compressed NFT asset ID (set by solana-listener.ts
--                 when FundsLocked is detected). Identifies the specific license NFT.
-- token_holder  : Current Solana pubkey that holds the cNFT (mirrored from chain).
--                 When the NFT is transferred, the holder changes → access revoked.
ALTER TABLE ip_licenses
  ADD COLUMN IF NOT EXISTS cnft_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS token_holder  TEXT;

CREATE INDEX IF NOT EXISTS idx_ip_licenses_cnft_asset_id
  ON ip_licenses (cnft_asset_id)
  WHERE cnft_asset_id IS NOT NULL;

-- ── 2. SOL amount on ledger ───────────────────────────────────────────────────
-- amount_lamports : SOL amount locked in the Anchor escrow PDA for this transaction.
--                   Set by solana-listener.ts on FundsLocked.
--                   Used for liquidity_score_sol calculation in /api/agents.
ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS amount_lamports BIGINT;

-- ── 3. Agents table (for cNFT gate in decrypt-key) ───────────────────────────
-- Stores solana_pubkey per agent for the server-side cNFT ownership check.
-- agents table is used by the decrypt-key Layer 5 to verify token_holder.
CREATE TABLE IF NOT EXISTS agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT UNIQUE NOT NULL,
  solana_pubkey TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Seed with agent data from database.json
-- (run manually or via the registry server startup)
INSERT INTO agents (agent_id, solana_pubkey)
VALUES
  ('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'),
  ('bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354', 'BrEqc6zHVR2gqFcRKhfRdZTLGqBkVEEFGhN9rJQfkiLK'),
  ('bafybeihkoviema7g3gxyt6la22f56eupkmzh2yw4lxnxoqkj52ql73yvf4', 'DRpbCBMxVnDK7mVeX6ZfGBzT5Z1GqHQTp3h1X9YvQgPH'),
  ('bafybeibuyer0000acmecorp000000000000000000000000000000000001', 'HXtBm8XZbxaTt41uqaKhwUAa6Z1UryvFPHBhZFMNTe3e')
ON CONFLICT (agent_id) DO UPDATE SET
  solana_pubkey = EXCLUDED.solana_pubkey,
  updated_at    = now();

-- ── 4. Referrals table ────────────────────────────────────────────────────────
-- Tracks referral relationships. When FundsReleased is detected by
-- solana-listener.ts, 1% of amount_lamports is sent to referrer's Solana wallet.
CREATE TABLE IF NOT EXISTS referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_agent_id TEXT NOT NULL,
  buyer_agent_id    TEXT,
  artifact_id       TEXT,
  vault_id          TEXT,
  reward_lamports   BIGINT,       -- actual lamports sent (set after payout)
  reward_tx         TEXT,         -- Solana tx signature of the reward payment
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_artifact_id
  ON referrals (artifact_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals (referrer_agent_id);

-- ── Summary ──────────────────────────────────────────────────────────────────
--
-- Changes from Phase 28:
--   ip_licenses.cnft_asset_id  — Metaplex cNFT asset ID (license NFT)
--   ip_licenses.token_holder   — current Solana wallet holding the license NFT
--   ledger.amount_lamports     — SOL amount locked for this deal
--   agents                     — agent_id → solana_pubkey mapping for Layer 5
--   referrals                  — 1% referral reward tracking
--
-- Replace env vars:
--   BASE_SEPOLIA_RPC_URL       → SOLANA_RPC_URL
--   A2A_CLEARINGHOUSE_ADDRESS  → A2A_CLEARINGHOUSE_PROGRAM_ID
--
-- New env vars:
--   PLATFORM_SOLANA_KEYPAIR    — base58 secret key for cNFT minting + referral payouts
--   MERKLE_TREE_ADDRESS        — Metaplex Merkle tree pubkey (create once with Bubblegum)
-- ─────────────────────────────────────────────────────────────────────────────
