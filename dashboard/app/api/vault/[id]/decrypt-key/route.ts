import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  createHash, createDecipheriv, createCipheriv,
  randomBytes, generateKeyPairSync, diffieHellman,
  hkdfSync, createPublicKey,
} from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { verifyTransaction } from "@/lib/chain";

const CORS    = { "Access-Control-Allow-Origin": "*" };
const DB_PATH = join(process.cwd(), "..", "database.json");

// X25519 SubjectPublicKeyInfo DER prefix:
//   SEQUENCE { SEQUENCE { OID 1.3.101.110 } BIT-STRING 00 }
const X25519_SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

// ─────────────────────────────────────────────────────────────────────────────
// Ed25519 public key → X25519 public key
// Birational equivalence between Edwards and Montgomery forms of Curve25519.
// Conversion: u = (1 + y) / (1 − y)  mod  p   (p = 2^255 − 19)
// This matches libsodium's crypto_sign_ed25519_pk_to_curve25519.
// ─────────────────────────────────────────────────────────────────────────────
function ed25519PubToX25519(edPubRaw: Buffer): Buffer {
  const P = 57896044618658097711785492504343953926634992332820282019728792003956564819949n;
  const modPow = (b: bigint, e: bigint, m: bigint): bigint => {
    let r = 1n; b %= m;
    for (; e > 0n; e >>= 1n) { if (e & 1n) r = r * b % m; b = b * b % m; }
    return r;
  };

  const edBytes = Buffer.from(edPubRaw); // copy — do not mutate
  edBytes[31] &= 0x7f;                    // clear sign bit to isolate y-coordinate
  const y = BigInt("0x" + Buffer.from(edBytes).reverse().toString("hex")); // LE→BE

  const u = ((1n + y) * modPow((P + 1n - y) % P, P - 2n, P)) % P;

  const out = Buffer.alloc(32);
  Buffer.from(u.toString(16).padStart(64, "0"), "hex").reverse().copy(out); // BE→LE
  return out;
}

// Load the raw 32-byte Ed25519 public key from database.json for a given agent
function getAgentEdPubRaw(agent_id: string): Buffer | null {
  if (!existsSync(DB_PATH)) return null;
  try {
    const db   = JSON.parse(readFileSync(DB_PATH, "utf-8"));
    const agent = (db.agents ?? []).find((a: { agent_id: string }) => a.agent_id === agent_id);
    if (!agent?.public_key) return null;
    const pem = agent.public_key as string;
    // Ed25519 SPKI DER: 12-byte header + 32-byte raw key
    const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""), "base64");
    return der.slice(-32);
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// GET /api/vault/[id]/decrypt-key?agent_id=<agent_id>
//
// Phase 23 enforcement layers (still active):
//   1. License expiry gate   — auto-SETTLED when license_days elapsed
//   2. Daily download cap    — 429 after max_key_downloads_per_day (default 10)
//   3. Access log            — every call written to license_key_accesses
//
// Phase 24 addition — Wrapped Key Delivery:
//   Content key is never returned in plaintext. Instead it is wrapped with a
//   key derived from the licensee's X25519 public key (converted from their
//   registered Ed25519 public key).  Only the agent holding the matching
//   Ed25519 private key can unwrap it using license_validator.py.
//
// Response fields:
//   wrapped_key   — AES-256-GCM ciphertext of the content key (base64)
//   ephemeral_pub — ephemeral X25519 public key for ECDH unwrap (base64, 32 B)
//   wrap_iv       — 12-byte AES-GCM IV used for wrapping (base64)
//   wrap_auth_tag — 16-byte AES-GCM auth tag (base64)
//   vault_id, license_id
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: vault_id } = await params;
  const { searchParams } = new URL(request.url);
  const agent_id = searchParams.get("agent_id");

  if (!agent_id) {
    return Response.json({ error: "agent_id query parameter is required" }, { status: 400, headers: CORS });
  }

  // Auth: Bearer sk-* or session cookie
  const authHeader = request.headers.get("authorization");
  let authed = false;
  if (authHeader?.startsWith("Bearer sk-")) {
    authed = await verifyApiKey(authHeader.slice(7));
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    authed = user !== null;
  }
  if (!authed) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Verify active signed license
  const { data: license, error: licErr } = await svc
    .from("ip_licenses")
    .select("id, status, artifact_id, created_at, custom_terms")
    .eq("vault_id", vault_id)
    .eq("licensee_agent_id", agent_id)
    .in("status", ["SIGNED", "EXECUTING", "SETTLED"])
    .not("artifact_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (licErr || !license) {
    return Response.json(
      { error: "No active signed license found for this vault entry and agent" },
      { status: 403, headers: CORS }
    );
  }

  // ── Layer 1: Expiry gate ─────────────────────────────────────────────────────
  const terms     = license.custom_terms as { license_days?: number; max_key_downloads_per_day?: number; hardware_id?: string } | null;
  const licenseDays = terms?.license_days ?? 0;
  if (licenseDays > 0 && license.created_at) {
    const expiry = new Date(license.created_at as string);
    expiry.setDate(expiry.getDate() + licenseDays);
    if (new Date() > expiry) {
      await svc.from("ip_licenses").update({ status: "SETTLED" }).eq("id", license.id);
      return Response.json(
        { error: "License expired — term has ended", expired_at: expiry.toISOString() },
        { status: 403, headers: CORS }
      );
    }
  }

  // Load encrypted content key from vault
  const { data: vault, error: vaultErr } = await svc
    .from("ip_vault")
    .select("content_key_encrypted")
    .eq("id", vault_id)
    .single();

  if (vaultErr || !vault?.content_key_encrypted) {
    return Response.json({ error: "Vault entry or content key not found" }, { status: 404, headers: CORS });
  }

  // Decrypt content key with platform master key
  const masterKeyHex = process.env.PLATFORM_MASTER_KEY ?? "";
  if (masterKeyHex.length !== 64) {
    return Response.json({ error: "Platform master key not configured" }, { status: 500, headers: CORS });
  }

  let contentKeyBuffer: Buffer;
  try {
    const masterKey = Buffer.from(masterKeyHex, "hex");
    const [ivB64, authTagB64, ciphertextB64] = vault.content_key_encrypted.split(":");
    const decipher = createDecipheriv("aes-256-gcm", masterKey, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    contentKeyBuffer = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  } catch {
    return Response.json({ error: "Failed to decrypt content key" }, { status: 500, headers: CORS });
  }

  // ── Layer 2: Daily download cap ──────────────────────────────────────────────
  const maxPerDay = terms?.max_key_downloads_per_day ?? 10;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await svc
    .from("license_key_accesses")
    .select("id", { count: "exact", head: true })
    .eq("license_id", license.id)
    .gte("accessed_at", since);
  if ((count ?? 0) >= maxPerDay) {
    return Response.json(
      { error: `Daily download limit reached (${maxPerDay}/day). Contact the licensor to adjust terms.` },
      { status: 429, headers: CORS }
    );
  }

  // ── Layer 4: On-chain payment finality gate ──────────────────────────────────
  // If the artifact linked to this license carries a tx_hash, the payment must
  // be VERIFIED_ON_CHAIN before the wrapped key is delivered. Off-chain payments
  // (no tx_hash) pass through unchanged — backward compatible.
  if (license.artifact_id) {
    const { data: ledgerEntry } = await svc
      .from("ledger")
      .select("tx_hash, on_chain_status")
      .eq("artifact_id", license.artifact_id)
      .maybeSingle();

    if (ledgerEntry?.tx_hash) {
      if (ledgerEntry.on_chain_status === "PENDING_ON_CHAIN") {
        // Attempt live re-verification (5 s window)
        const confirmed = await verifyTransaction(ledgerEntry.tx_hash as `0x${string}`);
        if (confirmed) {
          await svc
            .from("ledger")
            .update({ on_chain_status: "VERIFIED_ON_CHAIN" })
            .eq("artifact_id", license.artifact_id);
        } else {
          return Response.json(
            { error: "Payment transaction not yet confirmed on-chain. Try again in ~30 seconds.", tx_hash: ledgerEntry.tx_hash },
            { status: 402, headers: CORS }
          );
        }
      } else if (ledgerEntry.on_chain_status !== "VERIFIED_ON_CHAIN") {
        return Response.json(
          { error: "Payment transaction submitted but not yet on-chain.", tx_hash: ledgerEntry.tx_hash },
          { status: 402, headers: CORS }
        );
      }
      // VERIFIED_ON_CHAIN → proceed
    }
    // tx_hash is null → off-chain payment → allow
  }

  // ── Layer 5: Hardware binding gate ───────────────────────────────────────────
  // If the license carries a hardware_id (set during negotiation by the buyer's machine),
  // the request must include a matching X-Hardware-ID header. Licenses without a
  // hardware_id are unaffected — backward compatible with pre-Phase 27 licenses.
  if (terms?.hardware_id) {
    const sentHwId = request.headers.get("X-Hardware-ID");
    if (!sentHwId || sentHwId !== terms.hardware_id) {
      return Response.json(
        { error: "Hardware ID mismatch. This license is bound to a specific machine." },
        { status: 403, headers: CORS }
      );
    }
  }

  // ── Phase 24: Wrap content key for licensee's eyes only ─────────────────────
  const edPubRaw = getAgentEdPubRaw(agent_id);
  if (!edPubRaw) {
    return Response.json(
      { error: "Licensee public key not found in registry — cannot wrap key" },
      { status: 400, headers: CORS }
    );
  }

  let wrappedKeyB64: string;
  let ephPubB64:     string;
  let wrapIvB64:     string;
  let wrapAuthTagB64: string;

  try {
    // 1. Ed25519 pub → X25519 pub
    const x25519PubRaw  = ed25519PubToX25519(edPubRaw);
    const x25519PubSpki = Buffer.concat([X25519_SPKI_PREFIX, x25519PubRaw]);
    const x25519PubKey  = createPublicKey({ key: x25519PubSpki, format: "der", type: "spki" });

    // 2. Ephemeral X25519 keypair
    const { privateKey: ephPriv, publicKey: ephPub } = generateKeyPairSync("x25519");

    // 3. ECDH → shared secret
    const sharedSecret = diffieHellman({ privateKey: ephPriv, publicKey: x25519PubKey });

    // 4. HKDF-SHA256 → wrapping key
    const wrappingKey = Buffer.from(
      hkdfSync("sha256", sharedSecret, Buffer.alloc(0), Buffer.from("AGENTMARKET-KEY-WRAP-v1"), 32)
    );

    // 5. AES-256-GCM wrap
    const wrapIv      = randomBytes(12);
    const wrapCipher  = createCipheriv("aes-256-gcm", wrappingKey, wrapIv);
    const wrappedKey  = Buffer.concat([wrapCipher.update(contentKeyBuffer), wrapCipher.final()]);
    const wrapAuthTag = wrapCipher.getAuthTag();

    // 6. Export ephemeral pub as raw 32-byte key (strip 12-byte SPKI header)
    const ephPubDer = ephPub.export({ format: "der", type: "spki" }) as Buffer;
    const ephPubRaw = ephPubDer.slice(12);

    wrappedKeyB64   = wrappedKey.toString("base64");
    ephPubB64       = ephPubRaw.toString("base64");
    wrapIvB64       = wrapIv.toString("base64");
    wrapAuthTagB64  = wrapAuthTag.toString("base64");
  } catch (err) {
    console.error("[decrypt-key] key wrapping failed:", err);
    return Response.json({ error: "Key wrapping failed" }, { status: 500, headers: CORS });
  }

  // ── Layer 3: Access log (non-blocking) ──────────────────────────────────────
  svc.from("license_key_accesses").insert({
    license_id:        license.id,
    vault_id,
    licensee_agent_id: agent_id,
  }).then();

  return Response.json(
    {
      wrapped_key:            wrappedKeyB64,
      ephemeral_pub:          ephPubB64,
      wrap_iv:                wrapIvB64,
      wrap_auth_tag:          wrapAuthTagB64,
      vault_id,
      license_id:             license.id,
      ephemeral_key_rotation: "per-request",
      note:                   "Unwrap with your Ed25519 private key using license_validator.py. Do not share.",
    },
    { headers: CORS }
  );
}

async function verifyApiKey(key: string): Promise<boolean> {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) return false;
  const hash = createHash("sha256").update(key).digest("hex");
  const svc  = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc.from("api_keys").select("id").eq("key_hash", hash).single();
  return !error && data !== null;
}
