/**
 * solana-listener.ts — A2A On-Chain Settlement Listener (Solana)
 * ===============================================================
 * Replaces chain-listener.ts (Base Sepolia/EVM).
 *
 * Polls Solana Devnet for FundsLocked / FundsReleased / FundsReclaimed
 * program log events from the A2AClearinghouse Anchor program.
 *
 * On FundsLocked:
 *   1. Match on-chain task_id (sha256(artifact_id)) to a SIGNED license in Supabase
 *   2. Promote license: SIGNED → EXECUTING
 *   3. Update ledger.tx_hash + on_chain_status = VERIFIED_ON_CHAIN
 *   4. Mint compressed NFT (cNFT) to buyer's Solana wallet (if MERKLE_TREE_ADDRESS set)
 *
 * On FundsReleased:
 *   - Promote license: EXECUTING → SETTLED
 *   - Send 1% referral reward if a referral record exists
 *
 * On FundsReclaimed:
 *   - Revert license: EXECUTING → DRAFT
 *
 * Run:
 *   npx tsx --env-file dashboard/.env.local solana-listener.ts
 *
 * Required env vars (all in dashboard/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL        — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY       — Supabase service role key
 *   SOLANA_RPC_URL                  — Solana RPC (default: https://api.devnet.solana.com)
 *   A2A_CLEARINGHOUSE_PROGRAM_ID    — Deployed Anchor program ID (base58)
 *
 * Optional env vars:
 *   PLATFORM_SOLANA_KEYPAIR         — base58 secret key for cNFT minting + referral payouts
 *   MERKLE_TREE_ADDRESS             — Metaplex Merkle tree pubkey (required for cNFT minting)
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createHash }              from "crypto";
import { createClient }            from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join }                    from "path";
import bs58                        from "bs58";

// ─────────────────────────────────────────────────────────────────────────────
// Conditional cNFT import (requires @metaplex-foundation packages)
// ─────────────────────────────────────────────────────────────────────────────
let mintCNft: ((args: {
  umi:         unknown;
  treeAddress: string;
  ownerPubkey: string;
  name:        string;
}) => Promise<string | null>) | null = null;

try {
  const { createUmi }        = await import("@metaplex-foundation/umi-bundle-defaults");
  const { keypairIdentity }  = await import("@metaplex-foundation/umi");
  const { createTree, mintV1, mplBubblegum } = await import("@metaplex-foundation/mpl-bubblegum");

  mintCNft = async ({ umi: _umi, treeAddress, ownerPubkey, name }) => {
    try {
      const { publicKey, generateSigner } = await import("@metaplex-foundation/umi");
      const umi = _umi as ReturnType<typeof createUmi>;
      const assetSigner = generateSigner(umi);
      await mintV1(umi, {
        leafOwner:   publicKey(ownerPubkey),
        merkleTree:  publicKey(treeAddress),
        name,
        symbol:      "AML",
        uri:         "https://agentmarket.io/license-nft",
        sellerFeeBasisPoints: { basisPoints: 0n, identifier: "%", decimals: 2 },
        collection:  { key: publicKey("11111111111111111111111111111111"), verified: false },
        creators:    [],
      }).sendAndConfirm(umi);
      return assetSigner.publicKey.toString();
    } catch (err) {
      console.warn(`  [solana-listener] cNFT mint warning: ${err}`);
      return null;
    }
  };
  console.log("[solana-listener] Metaplex cNFT minting: enabled");
} catch {
  console.log("[solana-listener] Metaplex packages not installed — cNFT minting: disabled");
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RPC_URL        = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
const PROGRAM_ID_STR = process.env.A2A_CLEARINGHOUSE_PROGRAM_ID;
const KEYPAIR_B58    = process.env.PLATFORM_SOLANA_KEYPAIR;
const MERKLE_TREE    = process.env.MERKLE_TREE_ADDRESS;

const POLL_INTERVAL_MS = 10_000;
const CURSOR_FILE      = ".solana-listener-cursor.json";
const DB_PATH          = join(process.cwd(), "database.json");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[solana-listener] ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
if (!PROGRAM_ID_STR) {
  console.error("[solana-listener] ERROR: A2A_CLEARINGHOUSE_PROGRAM_ID is required (deploy Anchor program first).");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

const connection = new Connection(RPC_URL, "confirmed");
const svc        = createClient(SUPABASE_URL!, SUPABASE_KEY!);
const programId  = new PublicKey(PROGRAM_ID_STR);

// Platform keypair (optional, needed for cNFT minting and referral payouts)
let platformKeypair: Keypair | null = null;
if (KEYPAIR_B58) {
  try {
    platformKeypair = Keypair.fromSecretKey(bs58.decode(KEYPAIR_B58));
    console.log(`[solana-listener] Platform wallet: ${platformKeypair.publicKey.toBase58()}`);
  } catch {
    console.warn("[solana-listener] PLATFORM_SOLANA_KEYPAIR is invalid — cNFT and referral payouts disabled.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursor persistence
// ─────────────────────────────────────────────────────────────────────────────

function loadCursor(): string | null {
  if (existsSync(CURSOR_FILE)) {
    try {
      const { lastSignature } = JSON.parse(readFileSync(CURSOR_FILE, "utf-8"));
      return lastSignature ?? null;
    } catch { /* ignore */ }
  }
  return null;
}

function saveCursor(signature: string): void {
  writeFileSync(CURSOR_FILE, JSON.stringify({ lastSignature: signature }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Event parsing — reads from msg!() program log lines
// Format: "Program log: FundsLocked: task_id=<hex> buyer=<pubkey> lamports=<n>"
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedEvent {
  type:            "FundsLocked" | "FundsReleased" | "FundsReclaimed";
  task_id:         string;   // hex string (64 chars = 32 bytes)
  actor:           string;   // buyer or seller pubkey (base58)
  amount_lamports: number;
}

function parseEventLog(log: string): ParsedEvent | null {
  // "Program log: FundsLocked: task_id=<hex> buyer=<pk> lamports=<n>"
  const lockedM = log.match(
    /Program log: FundsLocked: task_id=([0-9a-f]+) buyer=(\S+) lamports=(\d+)/
  );
  if (lockedM) {
    return { type: "FundsLocked", task_id: lockedM[1], actor: lockedM[2], amount_lamports: Number(lockedM[3]) };
  }

  // "Program log: FundsReleased: task_id=<hex> seller=<pk> lamports=<n>"
  const releasedM = log.match(
    /Program log: FundsReleased: task_id=([0-9a-f]+) seller=(\S+) lamports=(\d+)/
  );
  if (releasedM) {
    return { type: "FundsReleased", task_id: releasedM[1], actor: releasedM[2], amount_lamports: Number(releasedM[3]) };
  }

  // "Program log: FundsReclaimed: task_id=<hex> buyer=<pk> lamports=<n>"
  const reclaimedM = log.match(
    /Program log: FundsReclaimed: task_id=([0-9a-f]+) buyer=(\S+) lamports=(\d+)/
  );
  if (reclaimedM) {
    return { type: "FundsReclaimed", task_id: reclaimedM[1], actor: reclaimedM[2], amount_lamports: Number(reclaimedM[3]) };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// License matcher — sha256(artifact_id) hex == on-chain task_id
// ─────────────────────────────────────────────────────────────────────────────

async function findLicenseByTaskId(taskIdHex: string): Promise<{
  id:                string;
  vault_id:          string;
  licensee_agent_id: string;
  artifact_id:       string;
  custom_terms:      Record<string, unknown>;
  status:            string;
} | null> {
  const { data: licenses, error } = await svc
    .from("ip_licenses")
    .select("id, vault_id, licensee_agent_id, artifact_id, custom_terms, status")
    .in("status", ["SIGNED", "EXECUTING"])
    .not("artifact_id", "is", null);

  if (error) {
    console.error(`  [solana-listener] Supabase query error: ${error.message}`);
    return null;
  }

  for (const lic of licenses ?? []) {
    const computed = createHash("sha256")
      .update(lic.artifact_id as string)
      .digest("hex");
    if (computed === taskIdHex) return lic as typeof findLicenseByTaskId extends (...args: unknown[]) => Promise<infer R> ? NonNullable<R> : never;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// cNFT minting
// ─────────────────────────────────────────────────────────────────────────────

async function mintLicenseNft(
  buyerPubkey:   string,
  vaultId:       string,
  licenseId:     string,
): Promise<string | null> {
  if (!mintCNft || !MERKLE_TREE || !platformKeypair) return null;

  try {
    const { createUmi }       = await import("@metaplex-foundation/umi-bundle-defaults");
    const { keypairIdentity } = await import("@metaplex-foundation/umi");

    const umi = createUmi(RPC_URL).use(keypairIdentity({
      publicKey:  { bytes: new Uint8Array(platformKeypair.publicKey.toBytes()) } as unknown as import("@metaplex-foundation/umi").PublicKey,
      secretKey:  platformKeypair.secretKey,
    } as unknown as import("@metaplex-foundation/umi").Signer));

    const assetId = await mintCNft({
      umi,
      treeAddress: MERKLE_TREE,
      ownerPubkey: buyerPubkey,
      name:        `AGENTMARKET License ${licenseId.slice(0, 8)}`,
    });

    if (assetId) {
      await svc
        .from("ip_licenses")
        .update({ cnft_asset_id: assetId, token_holder: buyerPubkey })
        .eq("id", licenseId);
      console.log(`  ✓ cNFT minted: ${assetId}`);
    }
    return assetId;
  } catch (err) {
    console.warn(`  [solana-listener] cNFT mint error: ${err}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral reward payout (1% of amount on FundsReleased)
// ─────────────────────────────────────────────────────────────────────────────

async function payReferralReward(
  artifactId:      string,
  amountLamports:  number,
): Promise<void> {
  if (!platformKeypair) return;

  const { data: referral } = await svc
    .from("referrals")
    .select("id, referrer_agent_id, reward_lamports")
    .eq("artifact_id", artifactId)
    .is("reward_tx", null)
    .maybeSingle();

  if (!referral) return;

  // Look up referrer's Solana pubkey from database.json
  let referrerPubkey: string | null = null;
  try {
    const db    = JSON.parse(readFileSync(DB_PATH, "utf-8"));
    const agent = (db.agents ?? []).find(
      (a: { agent_id: string }) => a.agent_id === referral.referrer_agent_id
    );
    referrerPubkey = agent?.solana_pubkey ?? null;
  } catch { /* ignore */ }

  if (!referrerPubkey) {
    console.warn(`  [solana-listener] Referrer ${referral.referrer_agent_id} has no solana_pubkey`);
    return;
  }

  const rewardLamports = Math.floor(amountLamports * 0.01);
  if (rewardLamports < 1) return;

  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: platformKeypair.publicKey,
        toPubkey:   new PublicKey(referrerPubkey),
        lamports:   rewardLamports,
      })
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [platformKeypair]);

    await svc
      .from("referrals")
      .update({ reward_lamports: rewardLamports, reward_tx: sig })
      .eq("id", referral.id);

    console.log(
      `  ✓ Referral reward: ${(rewardLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL → ${referral.referrer_agent_id} (tx: ${sig.slice(0, 12)}…)`
    );
  } catch (err) {
    console.warn(`  [solana-listener] Referral payout failed: ${err}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 34 — Verification Gate
// Runs AFTER FundsLocked is detected. Verifies the seller's VerificationScript
// hash and the artifact hash before auto-releasing escrowed SOL to the seller.
// In production this would run inside a TEE; for now it's a simulated check.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_HASH_RE = /^[0-9a-f]{64}$/;

/** Simulated TEE verification: PASS iff both hashes are valid 64-char hex. */
async function simulateVerification(
  taskIdHex:       string,
  artifactHashHex: string,
  scriptHash:      string,
  artifactId:      string,
): Promise<"PASS" | "FAIL"> {
  const hashesValid =
    VALID_HASH_RE.test(artifactHashHex) &&
    VALID_HASH_RE.test(scriptHash);
  const status: "PASS" | "FAIL" = hashesValid ? "PASS" : "FAIL";
  const notes = hashesValid
    ? `artifact_hash=${artifactHashHex.slice(0, 16)}… script_hash=${scriptHash.slice(0, 16)}…`
    : `Invalid hash format (artifact=${artifactHashHex.length} chars, script=${scriptHash.length} chars)`;

  // Persist result for audit
  await svc.from("verification_results").insert({
    artifact_id:   artifactId,
    task_id:       taskIdHex,
    status,
    script_hash:   scriptHash || null,
    artifact_hash: artifactHashHex || null,
    notes,
  });
  return status;
}

/**
 * Build an Anchor `release_funds` instruction.
 * Borsh layout: discriminator[8] + task_id[32] + artifact_hash_proof[32]
 * Matches programs/a2a-clearinghouse/src/lib.rs release_funds()
 */
function buildReleaseFundsIx(
  taskIdBytes:       Buffer,
  sellerPubkey:      PublicKey,
  escrowPda:         PublicKey,
  buyerPubkey:       PublicKey,
  artifactHashProof: Buffer,
): TransactionInstruction {
  const discriminator = createHash("sha256")
    .update("global:release_funds")
    .digest()
    .slice(0, 8);
  const data = Buffer.concat([discriminator, taskIdBytes, artifactHashProof]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: buyerPubkey,  isSigner: true,  isWritable: true },
      { pubkey: sellerPubkey, isSigner: false, isWritable: true },
      { pubkey: escrowPda,    isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Send the Anchor release_funds instruction using PLATFORM_SOLANA_KEYPAIR as
 * the buyer-proxy signer. In production the actual buyer would sign via multi-sig.
 */
async function autoReleaseFunds(
  taskIdHex:       string,
  sellerPubkeyStr: string,
  artifactHashHex: string,
): Promise<string | null> {
  if (!platformKeypair) {
    console.warn("  [VERIFY] PLATFORM_SOLANA_KEYPAIR not set — cannot auto-release funds.");
    return null;
  }
  try {
    const taskIdBytes       = Buffer.from(taskIdHex, "hex");
    const artifactHashBytes = Buffer.from(artifactHashHex, "hex");
    const sellerPubkey      = new PublicKey(sellerPubkeyStr);
    const buyerPubkey       = platformKeypair.publicKey;
    const [escrowPda]       = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), taskIdBytes],
      programId,
    );
    const ix  = buildReleaseFundsIx(taskIdBytes, sellerPubkey, escrowPda, buyerPubkey, artifactHashBytes);
    const tx  = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [platformKeypair]);
    console.log(`  [VERIFY] autoReleaseFunds TX: ${sig.slice(0, 12)}…`);
    return sig;
  } catch (err) {
    console.warn(`  [VERIFY] autoReleaseFunds failed: ${err}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleFundsLocked(
  event:     ParsedEvent,
  signature: string,
  slot:      number,
): Promise<void> {
  console.log(`\n[solana-listener] FundsLocked`);
  console.log(`  task_id: ${event.task_id}`);
  console.log(`  buyer:   ${event.actor}`);
  console.log(`  amount:  ${event.amount_lamports} lamports (${(event.amount_lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
  console.log(`  tx:      ${signature}`);
  console.log(`  slot:    ${slot}`);

  const lic = await findLicenseByTaskId(event.task_id);
  if (!lic) {
    console.warn(`  No SIGNED license matched task_id ${event.task_id} — skipping.`);
    return;
  }

  console.log(`  matched license: ${lic.id.slice(0, 8)}… (${lic.licensee_agent_id})`);

  // Promote SIGNED → EXECUTING
  const updatedTerms = {
    ...(lic.custom_terms ?? {}),
    locked_tx:              signature,
    locked_amount_lamports: event.amount_lamports.toString(),
    locked_at:              new Date().toISOString(),
    locked_slot:            slot.toString(),
  };

  const { error: licErr } = await svc
    .from("ip_licenses")
    .update({ status: "EXECUTING", custom_terms: updatedTerms })
    .eq("id", lic.id);

  if (licErr) {
    console.error(`  Failed to update license: ${licErr.message}`);
    return;
  }

  // Update ledger
  await svc
    .from("ledger")
    .update({
      tx_hash:         signature,
      on_chain_status: "VERIFIED_ON_CHAIN",
      amount_lamports: event.amount_lamports,
    })
    .eq("artifact_id", lic.artifact_id);

  console.log(`  ✓ License → EXECUTING`);
  console.log(`  ✓ Decryption key now available for licensee`);

  // Mint cNFT to buyer
  await mintLicenseNft(event.actor, lic.vault_id, lic.id);

  // ── Phase 34: Verification Gate ──────────────────────────────────────────
  // Fetch the artifact from the ledger to read verification_script_hash and artifact_hash
  const { data: ledgerRow } = await svc
    .from("ledger")
    .select("artifact, artifact_hash")
    .eq("artifact_id", lic.artifact_id)
    .maybeSingle();

  const artifact       = (ledgerRow?.artifact as Record<string, unknown> | null) ?? null;
  const terms          = (artifact?.terms    as Record<string, unknown> | null) ?? {};
  const parties        = (artifact?.parties  as Record<string, unknown> | null) ?? {};
  const licensor       = (parties.licensor   as Record<string, unknown> | null) ?? {};
  const scriptHash     = (terms.verification_script_hash as string | null) ?? "";
  const artifactHash   = (ledgerRow?.artifact_hash       as string | null) ?? "";
  const sellerSolPub   = (licensor.solana_pubkey         as string | null) ?? "";

  console.log(`\n  [VERIFY] Running verification gate…`);
  console.log(`  [VERIFY] script_hash  = ${scriptHash.slice(0, 20) || "(none)"}`);
  console.log(`  [VERIFY] artifact_hash= ${artifactHash.slice(0, 20) || "(none)"}`);

  const verifyStatus = await simulateVerification(
    event.task_id,
    artifactHash,
    scriptHash,
    lic.artifact_id,
  );
  console.log(`  [VERIFY] Result: ${verifyStatus}`);

  if (verifyStatus === "PASS") {
    if (sellerSolPub && artifactHash) {
      console.log(`  [VERIFY] PASS → submitting autoReleaseFunds…`);
      await autoReleaseFunds(event.task_id, sellerSolPub, artifactHash);
    } else {
      console.warn("  [VERIFY] PASS but seller solana_pubkey or artifact_hash missing — manual release required.");
    }
  } else {
    // Enter 24-hour dispute period — SOL remains locked in escrow
    const disputeEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await svc
      .from("ip_licenses")
      .update({ status: "DISPUTED", dispute_ends_at: disputeEndsAt })
      .eq("id", lic.id);
    console.log(`  [VERIFY] FAIL → License → DISPUTED. Dispute window ends: ${disputeEndsAt}`);
  }
}

async function handleFundsReleased(
  event:     ParsedEvent,
  signature: string,
): Promise<void> {
  console.log(`\n[solana-listener] FundsReleased (task_id: ${event.task_id})`);

  const lic = await findLicenseByTaskId(event.task_id);
  if (!lic) {
    console.warn(`  No EXECUTING license matched task_id ${event.task_id} — skipping.`);
    return;
  }

  await svc
    .from("ip_licenses")
    .update({ status: "SETTLED" })
    .eq("id", lic.id);

  await svc
    .from("ledger")
    .update({ on_chain_status: "VERIFIED_ON_CHAIN" })
    .eq("artifact_id", lic.artifact_id);

  console.log(`  ✓ License → SETTLED (tx: ${signature.slice(0, 12)}…)`);

  // Pay 1% referral reward
  await payReferralReward(lic.artifact_id, event.amount_lamports);
}

async function handleFundsReclaimed(
  event:     ParsedEvent,
  signature: string,
): Promise<void> {
  console.log(`\n[solana-listener] FundsReclaimed (task_id: ${event.task_id})`);

  const lic = await findLicenseByTaskId(event.task_id);
  if (!lic) {
    console.warn(`  No EXECUTING license matched task_id ${event.task_id} — skipping.`);
    return;
  }

  await svc
    .from("ip_licenses")
    .update({ status: "DRAFT" })
    .eq("id", lic.id);

  await svc
    .from("ledger")
    .update({ on_chain_status: "OFF_CHAIN" })
    .eq("artifact_id", lic.artifact_id);

  console.log(`  ✓ License → DRAFT — funds reclaimed by buyer (tx: ${signature.slice(0, 12)}…)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling loop
// ─────────────────────────────────────────────────────────────────────────────

async function poll(lastSignature: string | null): Promise<string | null> {
  let sigs;
  try {
    sigs = await connection.getSignaturesForAddress(programId, {
      until: lastSignature ?? undefined,
      limit: 50,
    });
  } catch (err) {
    console.warn(`[solana-listener] getSignaturesForAddress error: ${err}`);
    return lastSignature;
  }

  if (sigs.length === 0) return lastSignature;

  // Process in chronological order (oldest first)
  for (const sigInfo of [...sigs].reverse()) {
    let tx;
    try {
      tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
    } catch {
      continue;
    }

    const logs = tx?.meta?.logMessages ?? [];
    for (const log of logs) {
      const event = parseEventLog(log);
      if (!event) continue;

      if (event.type === "FundsLocked") {
        await handleFundsLocked(event, sigInfo.signature, sigInfo.slot);
      } else if (event.type === "FundsReleased") {
        await handleFundsReleased(event, sigInfo.signature);
      } else if (event.type === "FundsReclaimed") {
        await handleFundsReclaimed(event, sigInfo.signature);
      }
    }
  }

  // Return the newest signature (first in the array) as the new cursor
  return sigs[0].signature;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[solana-listener] Starting A2A Solana Settlement Listener");
  console.log(`  program: ${PROGRAM_ID_STR}`);
  console.log(`  rpc:     ${RPC_URL}`);
  console.log(`  poll:    every ${POLL_INTERVAL_MS / 1000}s`);
  if (MERKLE_TREE) console.log(`  tree:    ${MERKLE_TREE}`);

  let lastSignature = loadCursor();
  if (lastSignature) {
    console.log(`  cursor:  resuming from ${lastSignature.slice(0, 12)}…`);
  } else {
    console.log("  cursor:  starting fresh (only processing new transactions)");
    // Bootstrap: get the latest confirmed signature so we don't replay history
    const sigs = await connection.getSignaturesForAddress(programId, { limit: 1 });
    if (sigs.length > 0) {
      lastSignature = sigs[0].signature;
      saveCursor(lastSignature);
    }
  }

  console.log("[solana-listener] Listening for FundsLocked events on Solana devnet…\n");

  process.on("SIGINT",  () => { console.log("\n[solana-listener] Shutting down."); process.exit(0); });
  process.on("SIGTERM", () => { console.log("\n[solana-listener] Shutting down."); process.exit(0); });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const newSig = await poll(lastSignature);
    if (newSig && newSig !== lastSignature) {
      lastSignature = newSig;
      saveCursor(newSig);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[solana-listener] Fatal error:", err);
  process.exit(1);
});
