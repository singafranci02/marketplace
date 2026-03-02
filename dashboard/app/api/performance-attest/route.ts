import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash, verify as cryptoVerify } from "crypto";

const DB_PATH = join(process.cwd(), "..", "database.json");
const CORS    = { "Access-Control-Allow-Origin": "*" };

// ---------------------------------------------------------------------------
// Load agent public key from database.json
// ---------------------------------------------------------------------------

function getAgentPublicKey(agent_id: string): string | null {
  if (!existsSync(DB_PATH)) return null;
  try {
    const db = JSON.parse(readFileSync(DB_PATH, "utf-8"));
    const agent = (db.agents ?? []).find((a: { agent_id: string }) => a.agent_id === agent_id);
    return agent?.public_key ?? null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// POST /api/performance-attest
// Body: { license_id, pnl_eth, timestamp, signature (base64url), agent_id }
//
// Verifies licensee's Ed25519 signature over a canonical attestation payload,
// checks performance triggers, and auto-adjusts rev_share_pct if thresholds
// are crossed. Stores a signed attestation for audit.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  // Auth: Bearer sk-* required (agent-only endpoint)
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer sk-")) {
    return Response.json({ error: "Bearer sk-* API key required" }, { status: 401, headers: CORS });
  }
  const authed = await verifyApiKey(authHeader.slice(7), serviceUrl, serviceKey);
  if (!authed) {
    return Response.json({ error: "Invalid API key" }, { status: 401, headers: CORS });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

  const { license_id, pnl_eth, timestamp, signature, agent_id } = body as {
    license_id?: string;
    pnl_eth?:    number;
    timestamp?:  string;
    signature?:  string;
    agent_id?:   string;
  };

  if (!license_id || pnl_eth === undefined || !timestamp || !signature || !agent_id) {
    return Response.json(
      { error: "Missing required fields: license_id, pnl_eth, timestamp, signature, agent_id" },
      { status: 400, headers: CORS }
    );
  }

  // Verify Ed25519 signature over canonical attestation payload (sorted keys)
  const publicKeyPem = getAgentPublicKey(agent_id);
  if (!publicKeyPem) {
    return Response.json({ error: "Agent not found in verified registry" }, { status: 400, headers: CORS });
  }

  const canonicalPayload = JSON.stringify(
    Object.fromEntries(
      Object.entries({ license_id, pnl_eth, timestamp }).sort(([a], [b]) => a.localeCompare(b))
    )
  );

  let sigValid = false;
  try {
    const sigBuffer = Buffer.from(signature, "base64url");
    sigValid = cryptoVerify(
      null,
      Buffer.from(canonicalPayload, "utf-8"),
      publicKeyPem,
      sigBuffer
    );
  } catch {
    return Response.json({ error: "Signature verification failed — invalid format" }, { status: 401, headers: CORS });
  }

  if (!sigValid) {
    return Response.json({ error: "Signature verification failed — invalid signature" }, { status: 401, headers: CORS });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Load the license — must be SIGNED or EXECUTING and belong to this licensee
  const { data: license, error: licErr } = await svc
    .from("ip_licenses")
    .select("id, vault_id, licensee_agent_id, status, custom_terms, performance_triggers")
    .eq("id", license_id)
    .single();

  if (licErr || !license) {
    return Response.json({ error: "License not found" }, { status: 404, headers: CORS });
  }

  if (license.licensee_agent_id !== agent_id) {
    return Response.json({ error: "Agent is not the licensee for this license" }, { status: 403, headers: CORS });
  }

  if (!["SIGNED", "EXECUTING"].includes(license.status)) {
    return Response.json(
      { error: `License status is ${license.status} — attestation only valid for SIGNED or EXECUTING licenses` },
      { status: 400, headers: CORS }
    );
  }

  // Evaluate performance triggers: find the highest threshold crossed
  const triggers: { pnl_threshold_eth?: number; new_rev_share_pct?: number }[] =
    license.performance_triggers ?? [];

  let revShareTriggered: number | null = null;

  const crossed = triggers
    .filter((t) => t.pnl_threshold_eth !== undefined && pnl_eth >= t.pnl_threshold_eth!)
    .sort((a, b) => (b.pnl_threshold_eth ?? 0) - (a.pnl_threshold_eth ?? 0));

  if (crossed.length > 0 && crossed[0].new_rev_share_pct !== undefined) {
    revShareTriggered = crossed[0].new_rev_share_pct;
  }

  // Apply rev share adjustment if a trigger fired
  if (revShareTriggered !== null) {
    const updatedTerms = { ...(license.custom_terms ?? {}), rev_share_pct: revShareTriggered };
    await svc
      .from("ip_licenses")
      .update({ custom_terms: updatedTerms, status: "EXECUTING" })
      .eq("id", license_id);
  }

  // Store attestation record
  const { error: insertErr } = await svc
    .from("performance_attestations")
    .insert({
      license_id,
      licensee_agent_id: agent_id,
      pnl_eth,
      rev_share_triggered: revShareTriggered,
      signature,
    });

  if (insertErr) {
    return Response.json({ error: "Failed to store attestation" }, { status: 500, headers: CORS });
  }

  // Auto-promote vault trust_tier: UNVERIFIED → ATTESTED on first attestation
  const vaultId = (license as Record<string, unknown>).vault_id as string | null;
  if (vaultId) {
    await svc
      .from("ip_vault")
      .update({ trust_tier: "ATTESTED" })
      .eq("id", vaultId)
      .eq("trust_tier", "UNVERIFIED");
  }

  return Response.json(
    {
      attested:            true,
      license_id,
      pnl_eth,
      rev_share_triggered: revShareTriggered,
      message:             revShareTriggered !== null
        ? `Performance trigger fired — rev share adjusted to ${revShareTriggered}%`
        : "Attestation recorded — no trigger threshold crossed",
    },
    { status: 201, headers: CORS }
  );
}

async function verifyApiKey(key: string, serviceUrl: string, serviceKey: string): Promise<boolean> {
  const hash = createHash("sha256").update(key).digest("hex");
  const svc  = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc.from("api_keys").select("id").eq("key_hash", hash).single();
  return !error && data !== null;
}
