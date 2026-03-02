import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { verify as cryptoVerify, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { verifyTransaction } from "@/lib/chain";

const DB_PATH = join(process.cwd(), "..", "database.json");

// ---------------------------------------------------------------------------
// Key-sorting utility — must match Python's json.dumps(sort_keys=True)
// ---------------------------------------------------------------------------

function sortKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeysDeep((obj as Record<string, unknown>)[k])])
    );
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Ed25519 signature verification
// ---------------------------------------------------------------------------

interface ArtifactSignatures {
  algorithm: string;
  buyer_signature: string;
  seller_signature: string;
}

interface Artifact {
  artifact_id?: string;
  signatures?: ArtifactSignatures;
  parties?: {
    buyer?: { agent_id?: string };
    seller?: { agent_id?: string };
  };
  [key: string]: unknown;
}

function buildAgentMap(): Record<string, string> {
  const agentMap: Record<string, string> = {};
  if (existsSync(DB_PATH)) {
    try {
      const db = JSON.parse(readFileSync(DB_PATH, "utf-8"));
      for (const agent of db.agents ?? []) {
        if (agent.agent_id && agent.public_key) {
          agentMap[agent.agent_id] = agent.public_key;
        }
      }
    } catch { /* ignore parse errors */ }
  }
  return agentMap;
}

function canonicalBody(artifact: Artifact): Buffer {
  // Exclude signatures field — matches Python's canonical_body()
  const { signatures: _sig, ...rest } = artifact;
  void _sig;
  return Buffer.from(JSON.stringify(sortKeysDeep(rest)));
}

function verifyArtifact(
  artifact: Artifact,
  agentMap: Record<string, string>
): boolean {
  if (artifact.signatures?.algorithm !== "Ed25519") return false;

  const body      = canonicalBody(artifact);
  const buyerId   = artifact.parties?.buyer?.agent_id;
  const sellerId  = artifact.parties?.seller?.agent_id;
  const buyerKey  = buyerId  ? agentMap[buyerId]  : undefined;
  const sellerKey = sellerId ? agentMap[sellerId] : undefined;

  if (!buyerKey || !sellerKey) return false;

  try {
    const buyerOk = cryptoVerify(
      null,
      body,
      buyerKey,
      Buffer.from(artifact.signatures.buyer_signature, "base64url")
    );
    const sellerOk = cryptoVerify(
      null,
      body,
      sellerKey,
      Buffer.from(artifact.signatures.seller_signature, "base64url")
    );
    return buyerOk && sellerOk;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET — read ledger from Supabase
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authorized = await checkAuth(request);
  if (!authorized) {
    return Response.json(
      { error: "Unauthorized. Provide a session cookie or Authorization: Bearer <api-key>" },
      { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json([], { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data: rows, error } = await svc
    .from("ledger")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  const result = (rows ?? []).map((row, idx) => {
    const chainValid =
      idx === 0
        ? row.prev_hash === "GENESIS"
        : row.prev_hash === rows[idx - 1].artifact_hash;
    return { ...row.artifact, verified: row.verified, chain_valid: chainValid };
  });

  return Response.json(result, { headers: { "Access-Control-Allow-Origin": "*" } });
}

// ---------------------------------------------------------------------------
// POST — receive artifact, verify, chain-hash, store in Supabase
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const authorized = await checkAuth(request);
  if (!authorized) {
    return Response.json(
      { error: "Unauthorized. Provide Authorization: Bearer <api-key>" },
      { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  let artifact: Artifact;
  try {
    artifact = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  const tx_hash = typeof (artifact as Record<string, unknown>).tx_hash === "string"
    ? (artifact as Record<string, unknown>).tx_hash as string
    : undefined;

  const agentMap = buildAgentMap();
  const sigValid  = verifyArtifact(artifact, agentMap);

  // SHA-256 of the full artifact JSON (sorted keys, compact — includes signatures)
  const artifactJson = JSON.stringify(sortKeysDeep(artifact));
  const artifactHash = createHash("sha256").update(artifactJson).digest("hex");

  // Attempt on-chain receipt verification for Base Sepolia tx_hash (5 s timeout)
  let on_chain_status = "OFF_CHAIN";
  if (tx_hash) {
    const confirmed = await verifyTransaction(tx_hash as `0x${string}`);
    on_chain_status = confirmed ? "VERIFIED_ON_CHAIN" : "PENDING_ON_CHAIN";
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json(
      { error: "Server misconfigured" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // ── Commit pending reservation if present ──────────────────────────────
  const reservationId = (artifact as { policy_check?: { reservation_id?: string } })
    .policy_check?.reservation_id;

  if (reservationId) {
    const { data: reservation } = await svc
      .from("pending_reservations")
      .select("id, buyer_agent_id, amount_usd, status, expires_at")
      .eq("id", reservationId)
      .maybeSingle();

    if (
      reservation &&
      reservation.status === "pending" &&
      new Date(reservation.expires_at) > new Date()
    ) {
      await svc
        .from("pending_reservations")
        .update({ status: "committed" })
        .eq("id", reservationId);

      await svc.rpc("deduct_balance", {
        p_agent_id: reservation.buyer_agent_id,
        p_amount:   reservation.amount_usd,
      });

      const sellerAgentId =
        (artifact.parties as { seller?: { agent_id?: string } })?.seller?.agent_id;

      await svc.from("transactions").insert({
        reservation_id:  reservationId,
        buyer_agent_id:  reservation.buyer_agent_id,
        seller_agent_id: sellerAgentId ?? null,
        amount_usd:      reservation.amount_usd,
        artifact_id:     artifact.artifact_id ?? null,
      });
    }
  }

  // Get prev_hash from the most recent row
  const { data: lastRow } = await svc
    .from("ledger")
    .select("artifact_hash")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevHash = lastRow ? lastRow.artifact_hash : "GENESIS";

  const { error } = await svc.from("ledger").insert({
    artifact_id:     artifact.artifact_id ?? `artifact-${Date.now()}`,
    artifact,
    artifact_hash:   artifactHash,
    prev_hash:       prevHash,
    verified:        sigValid,
    tx_hash:         tx_hash ?? null,
    on_chain_status,
  });

  if (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  return Response.json(
    { artifact_hash: artifactHash, prev_hash: prevHash, verified: sigValid, tx_hash: tx_hash ?? null, on_chain_status },
    { status: 201, headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function checkAuth(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.startsWith("sk-")) return verifyApiKey(token);
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user !== null;
}

async function verifyApiKey(key: string): Promise<boolean> {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) return false;

  const hash = createHash("sha256").update(key).digest("hex");
  const serviceClient = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await serviceClient
    .from("api_keys")
    .select("id")
    .eq("key_hash", hash)
    .single();

  return !error && data !== null;
}
