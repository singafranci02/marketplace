import { randomBytes } from "crypto";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*" };
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// POST /api/auth/wallet-challenge
//
// No auth required — generates a one-time nonce for wallet signature auth.
// The agent signs "Challenge: <nonce>" with its Solana Ed25519 keypair,
// then calls POST /api/auth/wallet-verify with the signature + pubkey.
// ---------------------------------------------------------------------------

export async function POST() {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const nonce     = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const message   = `Challenge: ${nonce}`;

  const svc = createServiceClient(serviceUrl, serviceKey);
  const { error } = await svc.from("wallet_challenge_nonces").insert({
    nonce,
    pubkey:     "",           // unknown until verify step
    expires_at: expiresAt,
    used:       false,
  });

  if (error) {
    return Response.json({ error: "Failed to store nonce" }, { status: 500, headers: CORS });
  }

  return Response.json(
    { nonce, expires_at: expiresAt, message },
    { status: 200, headers: CORS }
  );
}
