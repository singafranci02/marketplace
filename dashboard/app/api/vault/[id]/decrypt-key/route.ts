import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash, createDecipheriv } from "crypto";

const CORS = { "Access-Control-Allow-Origin": "*" };

// ---------------------------------------------------------------------------
// GET /api/vault/[id]/decrypt-key?agent_id=<agent_id>
// Returns the AES-256 content decryption key for a vault entry, only if the
// requesting agent has a valid signed license (SIGNED / EXECUTING / SETTLED).
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
    .select("id, status, artifact_id")
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

  try {
    const masterKey = Buffer.from(masterKeyHex, "hex");
    const [ivB64, authTagB64, ciphertextB64] = vault.content_key_encrypted.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
    decipher.setAuthTag(authTag);
    const contentKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return Response.json(
      {
        content_key: contentKey.toString("base64"),
        vault_id,
        license_id:  license.id,
        note:        "Use this AES-256 key to decrypt the IPFS file. Do not share it.",
      },
      { headers: CORS }
    );
  } catch {
    return Response.json({ error: "Failed to decrypt content key" }, { status: 500, headers: CORS });
  }
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
