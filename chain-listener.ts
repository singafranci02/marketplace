/**
 * chain-listener.ts — DEPRECATED (Phase 28: Solana Pivot)
 * =========================================================
 * Replaced by solana-listener.ts (Solana/Anchor + cNFT).
 * Kept for EVM history reference only — do not run.
 *
 * chain-listener.ts — A2A On-Chain Settlement Listener (EVM/Base Sepolia)
 * =========================================================================
 * Polls Base Sepolia for FundsLocked events on the A2AClearinghouse contract.
 * When a FundsLocked event is detected, finds the matching Supabase license
 * (via keccak256(artifact_id) === event.taskId) and promotes it from
 * SIGNED → EXECUTING, signalling the licensee that their decryption key
 * is ready for unwrapping via license_validator.py.
 *
 * Run:
 *   npx tsx --env-file dashboard/.env.local chain-listener.ts
 *
 * Required env vars (all in dashboard/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — Supabase service role key
 *   BASE_SEPOLIA_RPC_URL         — Base Sepolia RPC (default: https://sepolia.base.org)
 *   A2A_CLEARINGHOUSE_ADDRESS    — Deployed A2AClearinghouse.sol address (0x...)
 *   A2A_FROM_BLOCK               — Optional: start block number (default: "latest")
 */

import { createPublicClient, http, keccak256, toBytes, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RPC_URL           = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const CONTRACT_ADDRESS  = process.env.A2A_CLEARINGHOUSE_ADDRESS as `0x${string}` | undefined;
const FROM_BLOCK_ENV    = process.env.A2A_FROM_BLOCK;
const POLL_INTERVAL_MS  = 15_000;
const CURSOR_FILE       = ".chain-listener-cursor.json";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[chain-listener] ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
if (!CONTRACT_ADDRESS) {
  console.error("[chain-listener] ERROR: A2A_CLEARINGHOUSE_ADDRESS is required (deploy A2AClearinghouse.sol first).");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

const publicClient = createPublicClient({
  chain:     baseSepolia,
  transport: http(RPC_URL),
});

const svc = createClient(SUPABASE_URL!, SUPABASE_KEY!);

// ─────────────────────────────────────────────────────────────────────────────
// ABI — only the event we care about
// ─────────────────────────────────────────────────────────────────────────────

const FUNDS_LOCKED_ABI = parseAbiItem(
  "event FundsLocked(bytes32 indexed taskId, address indexed buyer, uint256 amount)"
);

// ─────────────────────────────────────────────────────────────────────────────
// Block cursor — persisted so we don't reprocess on restart
// ─────────────────────────────────────────────────────────────────────────────

function loadCursor(): bigint {
  if (existsSync(CURSOR_FILE)) {
    try {
      const { lastBlock } = JSON.parse(readFileSync(CURSOR_FILE, "utf-8"));
      return BigInt(lastBlock);
    } catch { /* ignore */ }
  }
  if (FROM_BLOCK_ENV) return BigInt(FROM_BLOCK_ENV);
  return BigInt(0); // will be replaced with current block on first poll
}

function saveCursor(block: bigint): void {
  writeFileSync(CURSOR_FILE, JSON.stringify({ lastBlock: block.toString() }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handler
// ─────────────────────────────────────────────────────────────────────────────

interface FundsLockedArgs {
  taskId:      `0x${string}`;
  buyer:       `0x${string}`;
  amount:      bigint;
}

async function processEvent(
  args:            FundsLockedArgs,
  transactionHash: `0x${string}`,
  blockNumber:     bigint,
): Promise<void> {
  const { taskId, buyer, amount } = args;

  console.log(`\n[chain-listener] FundsLocked detected`);
  console.log(`  taskId: ${taskId}`);
  console.log(`  buyer:  ${buyer}`);
  console.log(`  amount: ${amount} wei`);
  console.log(`  tx:     ${transactionHash}`);
  console.log(`  block:  ${blockNumber}`);

  // ── Find matching SIGNED license ─────────────────────────────────────────
  const { data: licenses, error: qErr } = await svc
    .from("ip_licenses")
    .select("id, vault_id, licensee_agent_id, artifact_id, custom_terms")
    .eq("status", "SIGNED")
    .not("artifact_id", "is", null);

  if (qErr) {
    console.error(`  [chain-listener] Supabase query error: ${qErr.message}`);
    return;
  }

  let matched: {
    id:                 string;
    vault_id:           string;
    licensee_agent_id:  string;
    artifact_id:        string;
    custom_terms:       Record<string, unknown>;
  } | null = null;

  for (const lic of licenses ?? []) {
    // taskId on-chain = keccak256(bytes(artifact_id)) — matches Solidity's keccak256(bytes(artifactId))
    const computed = keccak256(toBytes(lic.artifact_id as string));
    if (computed.toLowerCase() === taskId.toLowerCase()) {
      matched = lic as typeof matched;
      break;
    }
  }

  if (!matched) {
    console.warn(`  [chain-listener] No SIGNED license matched taskId ${taskId} — skipping.`);
    return;
  }

  console.log(`  matched license: ${matched.id.slice(0, 8)}…`);
  console.log(`  licensee:        ${matched.licensee_agent_id}`);

  // ── Promote license to EXECUTING ─────────────────────────────────────────
  const updatedTerms = {
    ...(matched.custom_terms ?? {}),
    locked_tx:          transactionHash,
    locked_amount_wei:  amount.toString(),
    locked_at:          new Date().toISOString(),
    locked_block:       blockNumber.toString(),
  };

  const { error: licErr } = await svc
    .from("ip_licenses")
    .update({ status: "EXECUTING", custom_terms: updatedTerms })
    .eq("id", matched.id);

  if (licErr) {
    console.error(`  [chain-listener] Failed to update license: ${licErr.message}`);
    return;
  }

  // ── Update ledger on_chain_status ────────────────────────────────────────
  if (matched.artifact_id) {
    await svc
      .from("ledger")
      .update({
        tx_hash:        transactionHash,
        on_chain_status: "VERIFIED_ON_CHAIN",
      })
      .eq("artifact_id", matched.artifact_id);
  }

  console.log(`  ✓ License ${matched.id.slice(0, 8)}… → EXECUTING`);
  console.log(`  ✓ Decryption key now available — licensee can call license_validator.py`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling loop
// ─────────────────────────────────────────────────────────────────────────────

async function poll(fromBlock: bigint): Promise<bigint> {
  let latestBlock: bigint;
  try {
    latestBlock = await publicClient.getBlockNumber();
  } catch (err) {
    console.warn(`[chain-listener] Could not fetch latest block: ${err}`);
    return fromBlock;
  }

  if (latestBlock <= fromBlock) return fromBlock;

  try {
    const logs = await publicClient.getLogs({
      address:   CONTRACT_ADDRESS!,
      event:     FUNDS_LOCKED_ABI,
      fromBlock,
      toBlock:   latestBlock,
    });

    for (const log of logs) {
      if (log.args.taskId && log.args.buyer && log.args.amount !== undefined) {
        await processEvent(
          log.args as FundsLockedArgs,
          log.transactionHash,
          log.blockNumber,
        );
      }
    }
  } catch (err) {
    console.warn(`[chain-listener] getLogs error: ${err}`);
  }

  return latestBlock;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[chain-listener] Starting A2A On-Chain Settlement Listener");
  console.log(`  contract: ${CONTRACT_ADDRESS}`);
  console.log(`  rpc:      ${RPC_URL}`);
  console.log(`  poll:     every ${POLL_INTERVAL_MS / 1000}s`);

  let fromBlock = loadCursor();

  // If no cursor set, start from current block (don't reprocess history)
  if (fromBlock === BigInt(0)) {
    fromBlock = await publicClient.getBlockNumber();
    console.log(`  starting from current block: ${fromBlock}`);
    saveCursor(fromBlock);
  } else {
    console.log(`  resuming from block: ${fromBlock}`);
  }

  console.log("[chain-listener] Listening for FundsLocked events…\n");

  // Handle graceful shutdown
  process.on("SIGINT",  () => { console.log("\n[chain-listener] Shutting down."); process.exit(0); });
  process.on("SIGTERM", () => { console.log("\n[chain-listener] Shutting down."); process.exit(0); });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const newBlock = await poll(fromBlock);
    if (newBlock > fromBlock) {
      fromBlock = newBlock;
      saveCursor(fromBlock);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[chain-listener] Fatal error:", err);
  process.exit(1);
});
