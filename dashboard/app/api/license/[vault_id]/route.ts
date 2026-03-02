import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const CORS = { "Access-Control-Allow-Origin": "*" };

// ---------------------------------------------------------------------------
// POST — initiate license negotiation
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ vault_id: string }> }
) {
  const authorized = await checkAuth(request);
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const { vault_id } = await params;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

  const { licensee_agent_id, proposed_terms, performance_triggers } = body as {
    licensee_agent_id?: string;
    proposed_terms?: object;
    performance_triggers?: object[];
  };

  if (!licensee_agent_id || !proposed_terms) {
    return Response.json(
      { error: "Missing required fields: licensee_agent_id, proposed_terms" },
      { status: 400, headers: CORS }
    );
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Verify vault exists and is active
  const { data: vault, error: vaultError } = await svc
    .from("ip_vault")
    .select("id, title, license_template, status")
    .eq("id", vault_id)
    .maybeSingle();

  if (vaultError || !vault) {
    return Response.json({ error: "Vault not found" }, { status: 404, headers: CORS });
  }
  if (vault.status !== "active") {
    return Response.json({ error: "Vault is not active" }, { status: 409, headers: CORS });
  }

  // Merge base template with proposed overrides
  const mergedTerms = { ...(vault.license_template as object), ...(proposed_terms as object) };

  const { data, error } = await svc
    .from("ip_licenses")
    .insert({
      vault_id,
      licensee_agent_id,
      custom_terms:         mergedTerms,
      performance_triggers: performance_triggers ?? [],
      status:               "DRAFT",
    })
    .select("id, status, custom_terms, created_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });

  return Response.json(
    {
      license_id:  data.id,
      vault_title: vault.title,
      terms:       data.custom_terms,
      status:      data.status,
      created_at:  data.created_at,
    },
    { status: 201, headers: CORS }
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
  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc.from("api_keys").select("id").eq("key_hash", hash).single();
  return !error && data !== null;
}
