import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash, createDecipheriv } from "crypto";

const CORS = { "Access-Control-Allow-Origin": "*" };

// ---------------------------------------------------------------------------
// GET /api/vault/[id]/decrypt-key?agent_id=<agent_id>
// Returns the AES-256 content decryption key for a vault entry, only if the
// requesting agent has a valid signed license (SIGNED / EXECUTING / SETTLED).
//
// Enforcement layers:
//   1. License expiry gate  — rejects if license_days elapsed since created_at
//   2. Daily download cap   — rejects if > max_key_downloads_per_day (default 10)
//   3. Access log           — every successful call is recorded in license_key_accesses
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

  // Verify the requesting agent has a signed/executing/settled license for this vault
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

  // ── Layer 1: License expiry gate ────────────────────────────────────────────
  const terms = license.custom_terms as { license_days?: number; max_key_downloads_per_day?: number } | null;
  const licenseDays = terms?.license_days ?? 0;

  if (licenseDays > 0 && license.created_at) {
    const expiry = new Date(license.created_at as string);
    expiry.setDate(expiry.getDate() + licenseDays);
    if (new Date() > expiry) {
      // Auto-transition to SETTLED on expiry
      await svc.from("ip_licenses").update({ status: "SETTLED" }).eq("id", license.id);
      return Response.json(
        { error: "License expired — term has ended", expired_at: expiry.toISOString() },
        { status: 403, headers: CORS }
      );
    }
  }

  // Load the encrypted content key
  const { data: vault, error: vaultErr } = await svc
    .from("ip_vault")
    .select("content_key_encrypted")
    .eq("id", vault_id)
    .single();

  if (vaultErr || !vault) {
    return Response.json({ error: "Vault entry not found" }, { status: 404, headers: CORS });
  }

  if (!vault.content_key_encrypted) {
    return Response.json(
      { error: "This vault entry has no encrypted content key (escrowed before key encryption was enabled)" },
      { status: 404, headers: CORS }
    );
  }

  // Decrypt with platform master key
  const masterKeyHex = process.env.PLATFORM_MASTER_KEY ?? "";
  if (masterKeyHex.length !== 64) {
    return Response.json({ error: "Platform master key not configured" }, { status: 500, headers: CORS });
  }

  let contentKeyB64: string;
  try {
    const masterKey = Buffer.from(masterKeyHex, "hex");
    const [ivB64, authTagB64, ciphertextB64] = vault.content_key_encrypted.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
    decipher.setAuthTag(authTag);
    contentKeyB64 = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("base64");
  } catch {
    return Response.json({ error: "Failed to decrypt content key" }, { status: 500, headers: CORS });
  }

  // ── Layer 2: Daily download cap ─────────────────────────────────────────────
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

  // ── Layer 3: Access log (non-blocking) ──────────────────────────────────────
  svc.from("license_key_accesses").insert({
    license_id:        license.id,
    vault_id,
    licensee_agent_id: agent_id,
  }).then();

  return Response.json(
    {
      content_key: contentKeyB64,
      vault_id,
      license_id:  license.id,
      note:        "Use this AES-256 key to decrypt the IPFS file. Do not share it — redistribution violates your license agreement.",
    },
    { headers: CORS }
  );
}

async function verifyApiKey(key: string): Promise<boolean> {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) return false;
  const hash = createHash("sha256").update(key).digest("hex");
  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc.from("api_keys").select("id").eq("key_hash", hash).single();
  return !error && data !== null;
}
