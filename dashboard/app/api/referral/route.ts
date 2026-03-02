import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const CORS = { "Access-Control-Allow-Origin": "*" };

// ---------------------------------------------------------------------------
// POST /api/referral
//
// Register a referral link between a referrer agent and an artifact purchase.
// When the buyer's on-chain payment is settled (FundsReleased detected by
// solana-listener.ts), 1% of the SOL amount is automatically sent to the
// referrer's Solana wallet.
//
// Body:
//   { referrer_agent_id: string, artifact_id: string }
//
// Response:
//   { referral_id: string, status: "queued" }
//
// Auth: Bearer sk-* required
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer sk-")) {
    return Response.json({ error: "Bearer sk-* API key required" }, { status: 401, headers: CORS });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const authed = await verifyApiKey(authHeader.slice(7), serviceUrl, serviceKey);
  if (!authed) {
    return Response.json({ error: "Invalid API key" }, { status: 401, headers: CORS });
  }

  let body: { referrer_agent_id?: string; artifact_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const { referrer_agent_id, artifact_id } = body;
  if (!referrer_agent_id || !artifact_id) {
    return Response.json(
      { error: "referrer_agent_id and artifact_id are required" },
      { status: 400, headers: CORS }
    );
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Look up buyer_agent_id from ledger
  const { data: ledgerEntry } = await svc
    .from("ledger")
    .select("artifact")
    .eq("artifact_id", artifact_id)
    .maybeSingle();

  const buyerAgentId =
    (ledgerEntry?.artifact as { parties?: { licensee?: { agent_id?: string } } })
      ?.parties?.licensee?.agent_id ?? null;

  // Look up vault_id from ip_licenses
  const { data: licEntry } = await svc
    .from("ip_licenses")
    .select("vault_id")
    .eq("artifact_id", artifact_id)
    .maybeSingle();

  // Prevent self-referral
  if (referrer_agent_id === buyerAgentId) {
    return Response.json({ error: "Self-referral is not allowed" }, { status: 400, headers: CORS });
  }

  // Check for duplicate referral on this artifact
  const { data: existing } = await svc
    .from("referrals")
    .select("id")
    .eq("artifact_id", artifact_id)
    .maybeSingle();

  if (existing) {
    return Response.json(
      { error: "A referral for this artifact already exists", referral_id: existing.id },
      { status: 409, headers: CORS }
    );
  }

  const { data: referral, error: insertErr } = await svc
    .from("referrals")
    .insert({
      referrer_agent_id,
      buyer_agent_id: buyerAgentId,
      artifact_id,
      vault_id: licEntry?.vault_id ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !referral) {
    return Response.json(
      { error: insertErr?.message ?? "Failed to create referral" },
      { status: 500, headers: CORS }
    );
  }

  return Response.json(
    {
      referral_id: referral.id,
      status:      "queued",
      note:        "1% of the SOL payment will be sent to the referrer's Solana wallet on settlement.",
    },
    { status: 201, headers: CORS }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function verifyApiKey(key: string, serviceUrl: string, serviceKey: string): Promise<boolean> {
  const hash = createHash("sha256").update(key).digest("hex");
  const svc  = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc.from("api_keys").select("id").eq("key_hash", hash).single();
  return !error && data !== null;
}
