import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const CORS = { "Access-Control-Allow-Origin": "*" };

// ---------------------------------------------------------------------------
// GET /api/license/check?vault_id=<vault_id>&agent_id=<agent_id>
//
// Lightweight license validity check — does NOT consume the daily download
// quota (no access log entry). Use this to verify license status before
// attempting to retrieve the content key.
//
// Returns:
//   { valid: true,  license_id, status, expires_at | null }
//   { valid: false, reason: "not_found" | "revoked" | "expired" }
//
// Auth: Bearer sk-* required
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vault_id = searchParams.get("vault_id");
  const agent_id = searchParams.get("agent_id");

  if (!vault_id || !agent_id) {
    return Response.json(
      { error: "vault_id and agent_id query parameters are required" },
      { status: 400, headers: CORS }
    );
  }

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

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Find the most recent license (any status) for this vault + agent
  const { data: license, error: licErr } = await svc
    .from("ip_licenses")
    .select("id, status, created_at, custom_terms, artifact_id")
    .eq("vault_id", vault_id)
    .eq("licensee_agent_id", agent_id)
    .not("artifact_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (licErr || !license) {
    return Response.json({ valid: false, reason: "not_found" }, { headers: CORS });
  }

  if (license.status === "REVOKED") {
    return Response.json({ valid: false, reason: "revoked" }, { headers: CORS });
  }

  if (!["SIGNED", "EXECUTING", "SETTLED"].includes(license.status)) {
    return Response.json({ valid: false, reason: "not_found" }, { headers: CORS });
  }

  // Expiry check
  const terms     = license.custom_terms as { license_days?: number } | null;
  const licenseDays = terms?.license_days ?? 0;
  let expiresAt: string | null = null;

  if (licenseDays > 0 && license.created_at) {
    const expiry = new Date(license.created_at as string);
    expiry.setDate(expiry.getDate() + licenseDays);
    expiresAt = expiry.toISOString();
    if (new Date() > expiry) {
      return Response.json({ valid: false, reason: "expired", expired_at: expiresAt }, { headers: CORS });
    }
  }

  // Check on-chain payment status (informational — does not gate access here)
  // null = no blockchain tx (off-chain); true = confirmed; false = pending
  let tx_verified: boolean | null = null;
  if (license.artifact_id) {
    const { data: ledgerEntry } = await svc
      .from("ledger")
      .select("tx_hash, on_chain_status")
      .eq("artifact_id", license.artifact_id)
      .maybeSingle();
    if (ledgerEntry?.tx_hash) {
      tx_verified = ledgerEntry.on_chain_status === "VERIFIED_ON_CHAIN";
    }
  }

  return Response.json(
    {
      valid:       true,
      license_id:  license.id,
      status:      license.status,
      expires_at:  expiresAt,
      tx_verified,
    },
    { headers: CORS }
  );
}

async function verifyApiKey(key: string, serviceUrl: string, serviceKey: string): Promise<boolean> {
  const hash = createHash("sha256").update(key).digest("hex");
  const svc  = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc.from("api_keys").select("id").eq("key_hash", hash).single();
  return !error && data !== null;
}
