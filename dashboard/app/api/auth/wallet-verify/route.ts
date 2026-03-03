import { randomBytes, createHash } from "crypto";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import * as ed from "@noble/ed25519";

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// POST /api/auth/wallet-verify
//
// No auth required — verifies a wallet challenge signature and issues sk-* key.
//
// Body: { pubkey: "<base58>", signature: "<base64url>", nonce: "<hex>" }
//
// Flow:
//   1. Validate nonce exists, not expired, not used
//   2. Reconstruct message: "Challenge: <nonce>"
//   3. Verify Ed25519 signature against pubkey (base58 → raw bytes)
//   4. Mark nonce used (replay protection)
//   5. Issue sk-* key stored with solana_pubkey + 30-day TTL
//   6. Return { api_key, expires_at }
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  let body: { pubkey?: string; signature?: string; nonce?: string };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

  const { pubkey, signature, nonce } = body;
  if (!pubkey || !signature || !nonce) {
    return Response.json(
      { error: "Missing fields: pubkey, signature, nonce" },
      { status: 400, headers: CORS }
    );
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // 1. Look up nonce
  const { data: nonceRow, error: nonceLookupErr } = await svc
    .from("wallet_challenge_nonces")
    .select("id, expires_at, used")
    .eq("nonce", nonce)
    .maybeSingle();

  if (nonceLookupErr || !nonceRow) {
    return Response.json({ error: "Invalid or unknown nonce" }, { status: 400, headers: CORS });
  }
  if (nonceRow.used) {
    return Response.json({ error: "Nonce already used" }, { status: 400, headers: CORS });
  }
  if (new Date(nonceRow.expires_at) < new Date()) {
    return Response.json({ error: "Nonce expired" }, { status: 400, headers: CORS });
  }

  // 2. Decode pubkey (base58 → Uint8Array)
  let pubkeyBytes: Uint8Array;
  try {
    pubkeyBytes = base58ToBytes(pubkey);
    if (pubkeyBytes.length !== 32) throw new Error("invalid length");
  } catch {
    return Response.json({ error: "Invalid pubkey format (expected base58)" }, { status: 400, headers: CORS });
  }

  // 3. Decode signature (base64url or base64 → Uint8Array)
  let sigBytes: Uint8Array;
  try {
    const b64 = signature.replace(/-/g, "+").replace(/_/g, "/");
    sigBytes   = Uint8Array.from(Buffer.from(b64, "base64"));
    if (sigBytes.length !== 64) throw new Error("invalid length");
  } catch {
    return Response.json({ error: "Invalid signature format (expected base64url, 64 bytes)" }, { status: 400, headers: CORS });
  }

  // 4. Verify Ed25519 signature over "Challenge: <nonce>"
  const message = new TextEncoder().encode(`Challenge: ${nonce}`);
  let valid: boolean;
  try {
    valid = await ed.verify(sigBytes, message, pubkeyBytes);
  } catch {
    valid = false;
  }
  if (!valid) {
    return Response.json({ error: "Signature verification failed" }, { status: 401, headers: CORS });
  }

  // 5. Mark nonce used (replay protection)
  await svc
    .from("wallet_challenge_nonces")
    .update({ used: true, pubkey })
    .eq("id", nonceRow.id);

  // 6. Generate sk-* API key
  const rawKey    = `sk-${randomBytes(32).toString("hex")}`;
  const keyHash   = createHash("sha256").update(rawKey).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  const { error: insertErr } = await svc.from("api_keys").insert({
    key_hash:      keyHash,
    user_id:       null,                // no Supabase user for wallet-authed agents
    name:          `wallet:${pubkey.slice(0, 8)}…`,
    solana_pubkey: pubkey,
    auth_method:   "wallet",
    expires_at:    expiresAt,
    tos_accepted_at: new Date().toISOString(), // implicit ToS acceptance via wallet signature
  });

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500, headers: CORS });
  }

  return Response.json(
    {
      api_key:    rawKey,
      expires_at: expiresAt,
      message:    "API key issued. Use as: Authorization: Bearer <api_key>",
    },
    { status: 201, headers: CORS }
  );
}

// ---------------------------------------------------------------------------
// Base58 decode (Solana pubkey format)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58ToBytes(input: string): Uint8Array {
  const chars  = BASE58_ALPHABET;
  let result   = BigInt(0);
  const base   = BigInt(58);
  let leadingZeros = 0;

  for (const char of input) {
    const idx = chars.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base58 character: ${char}`);
    result = result * base + BigInt(idx);
  }
  for (const char of input) {
    if (char !== "1") break;
    leadingZeros++;
  }

  const bytes: number[] = [];
  while (result > 0n) {
    bytes.unshift(Number(result & 0xffn));
    result >>= 8n;
  }
  return new Uint8Array([...new Array(leadingZeros).fill(0), ...bytes]);
}
