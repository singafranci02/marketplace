import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const DB_PATH = join(process.cwd(), "..", "database.json");
const CORS = { "Access-Control-Allow-Origin": "*" };
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// POST /api/agents/register — self-service agent registration
// Auth: Bearer sk-* API key OR Supabase session
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const authed = await checkAuth(request);
  if (!authed) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

  const {
    name,
    owner,
    agent_id: providedId,
    legal_entity_id,
    endpoint,
    policy_endpoint,
    compliance,
    capabilities,
    description,
    solana_pubkey,
    public_key,
  } = body as {
    name?:            string;
    owner?:           string;
    agent_id?:        string;
    legal_entity_id?: string;
    endpoint?:        string;
    policy_endpoint?: string;
    compliance?:      string[];
    capabilities?:    object[];
    description?:     string;
    solana_pubkey?:   string;
    public_key?:      string;
  };

  if (!name || !owner) {
    return Response.json(
      { error: "Missing required fields: name, owner" },
      { status: 400, headers: CORS }
    );
  }

  // Determine agent_id
  let agent_id: string;
  if (providedId) {
    const slug = providedId.toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return Response.json(
        { error: "agent_id must be 3–48 chars, lowercase alphanumeric and hyphens only, cannot start/end with hyphen" },
        { status: 400, headers: CORS }
      );
    }
    agent_id = slug;
  } else {
    const hash = createHash("sha256").update(name + owner + Date.now()).digest("hex");
    agent_id = `agent-${hash.slice(0, 8)}`;
  }

  // Check uniqueness in database.json
  if (existsSync(DB_PATH)) {
    try {
      const db = JSON.parse(readFileSync(DB_PATH, "utf-8"));
      const exists = (db.agents ?? []).some((a: { agent_id: string }) => a.agent_id === agent_id);
      if (exists) {
        return Response.json(
          { error: `agent_id "${agent_id}" is already registered` },
          { status: 409, headers: CORS }
        );
      }
    } catch { /* ignore */ }
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Check uniqueness in registered_agents
  const { data: existing } = await svc
    .from("registered_agents")
    .select("agent_id")
    .eq("agent_id", agent_id)
    .maybeSingle();

  if (existing) {
    return Response.json(
      { error: `agent_id "${agent_id}" is already registered` },
      { status: 409, headers: CORS }
    );
  }

  // Get user_id from session (null for API key callers)
  let user_id: string | null = null;
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer sk-")) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    user_id = user?.id ?? null;
  }

  const { data, error } = await svc
    .from("registered_agents")
    .insert({
      agent_id,
      user_id,
      name,
      owner,
      legal_entity_id:  legal_entity_id ?? null,
      endpoint:         endpoint ?? null,
      policy_endpoint:  policy_endpoint ?? null,
      compliance:       compliance ?? [],
      capabilities:     capabilities ?? [],
      description:      description ?? null,
      solana_pubkey:    solana_pubkey ?? null,
      public_key:       public_key ?? null,
    })
    .select("agent_id, name, owner, status, joined_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return Response.json(
    {
      agent_id:  data.agent_id,
      name:      data.name,
      owner:     data.owner,
      status:    data.status,
      joined_at: data.joined_at,
      message:   `Agent registered. You can now create vaults using agent_id: "${data.agent_id}".`,
      next_steps: {
        create_vault:     "POST /api/vault  { agent_id, ipfs_hash, ip_type, title, license_template }",
        send_heartbeat:   "POST /api/heartbeat  { agent_id }",
        view_in_registry: `GET /api/agents?id=${data.agent_id}`,
      },
    },
    { status: 201, headers: CORS }
  );
}

async function checkAuth(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer sk-")) return verifyApiKey(authHeader.slice(7));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user !== null;
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
