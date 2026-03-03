/**
 * init-platform.ts
 * One-time script: initialises the PlatformConfig PDA on-chain.
 * Sets the admin pubkey that can call resolve_dispute.
 *
 * Run: npx tsx scripts/init-platform.ts
 *
 * Uses ~/.config/solana/id.json as the payer/admin keypair.
 * Program ID: DiL4BkxN8sbfzg62JvvxJbUbM3JYa9Y1MoeLpd8oV9gi
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";

const PROGRAM_ID   = new PublicKey("DiL4BkxN8sbfzg62JvvxJbUbM3JYa9Y1MoeLpd8oV9gi");
const RPC_URL      = "https://api.devnet.solana.com";
const KEYPAIR_PATH = `${homedir()}/.config/solana/id.json`;

// Anchor discriminator = sha256("global:<ix_name>").slice(0, 8)
function discriminator(name: string): Buffer {
  return Buffer.from(createHash("sha256").update(`global:${name}`).digest()).subarray(0, 8);
}

async function main() {
  // Load payer keypair (also becomes the admin)
  const secret = JSON.parse(readFileSync(KEYPAIR_PATH, "utf-8")) as number[];
  const payer  = Keypair.fromSecretKey(Uint8Array.from(secret));
  const admin  = payer.publicKey;

  console.log("Payer / admin:", admin.toBase58());

  const connection = new Connection(RPC_URL, "confirmed");

  // Derive PlatformConfig PDA  (seeds: ["config"])
  const [platformConfigPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID,
  );
  console.log("PlatformConfig PDA:", platformConfigPda.toBase58(), "bump:", bump);

  // Check if already initialised
  const existing = await connection.getAccountInfo(platformConfigPda);
  if (existing) {
    console.log("PlatformConfig already exists — skipping. Done.");
    process.exit(0);
  }

  // Build init_platform instruction data:
  //   [0:8]   discriminator
  //   [8:40]  admin pubkey (32 bytes)
  const disc = discriminator("init_platform");
  const data = Buffer.concat([disc, admin.toBuffer()]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  }, // payer
      { pubkey: platformConfigPda,  isSigner: false, isWritable: true  }, // platform_config (init)
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    data,
  });

  const tx  = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);

  console.log("init_platform TX:", sig);
  console.log("PlatformConfig initialised. Admin:", admin.toBase58());
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
