import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const CORS = { "Access-Control-Allow-Origin": "*" };

// ---------------------------------------------------------------------------
// POST /api/license/[id]/revoke
// Body: { agent_id, ban?: boolean }
//
// Allows the IP licensor (vault owner) to revoke a license at any time.
// Sets ip_licenses.status = "REVOKED", blocking all future decrypt-key calls
// for that licensee immediately.
//
// Optional: { ban: true } — also sets the vault's trust_tier to "BANNED",
// signalling to all buyers that this IP has been compromised or redistributed.
//
// Auth: Bearer sk-* (licensor's API key)
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: license_id } = await params;

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  // Auth: Bearer sk-* required
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

  const { agent_id, ban } = body as { agent_id?: string; ban?: boolean };
  if (!agent_id) {
    return Response.json({ error: "agent_id is required" }, { status: 400, headers: CORS });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Load the license to get vault_id
  const { data: license, error: licErr } = await svc
    .from("ip_licenses")
    .select("id, status, vault_id")
    .eq("id", license_id)
    .single();

  if (licErr || !license) {
    return Response.json({ error: "License not found" }, { status: 404, headers: CORS });
  }

  if (license.status === "REVOKED") {
    return Response.json({ error: "License is already revoked" }, { status: 400, headers: CORS });
  }

  // Verify the caller is the vault owner (licensor)
  const { data: vault, error: vaultErr } = await svc
    .from("ip_vault")
    .select("owner_agent_id")
    .eq("id", license.vault_id)
    .single();

  if (vaultErr || !vault) {
    return Response.json({ error: "Vault not found" }, { status: 404, headers: CORS });
  }

  if (vault.owner_agent_id !== agent_id) {
    return Response.json(
      { error: "Only the vault owner (licensor) can revoke this license" },
      { status: 403, headers: CORS }
    );
  }

  // Revoke license
  const { error: updateErr } = await svc
    .from("ip_licenses")
    .update({ status: "REVOKED" })
    .eq("id", license_id);

  if (updateErr) {
    return Response.json({ error: "Failed to revoke license" }, { status: 500, headers: CORS });
  }

  // If ban: true — flag the vault as BANNED (IP compromised / redistributed)
  let banned = false;
  if (ban === true) {
    await svc
      .from("ip_vault")
      .update({ trust_tier: "BANNED" })
      .eq("id", license.vault_id);
    banned = true;
  }

  return Response.json(
    {
      revoked:    true,
      banned,
      license_id,
      message:    banned
        ? "License revoked and vault flagged as BANNED — IP marked as compromised"
        : "License revoked — licensee can no longer access the content key",
    },
    { status: 200, headers: CORS }
  );
}

async function verifyApiKey(key: string, serviceUrl: string, serviceKey: string): Promise<boolean> {
  const hash = createHash("sha256").update(key).digest("hex");
  const svc  = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc.from("api_keys").select("id").eq("key_hash", hash).single();
  return !error && data !== null;
}
