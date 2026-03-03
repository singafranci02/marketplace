import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// GET /api/intents — public, CORS *
// Query params: status (default OPEN), ip_type, min_budget_sol
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const url         = new URL(req.url);
  const status      = url.searchParams.get("status") ?? "OPEN";
  const ip_type     = url.searchParams.get("ip_type");
  const minBudgetSOL = parseFloat(url.searchParams.get("min_budget_sol") ?? "0") || 0;
  const minBudgetLamps = Math.floor(minBudgetSOL * 1e9);

  const svc = createServiceClient(serviceUrl, serviceKey);

  let query = svc
    .from("buyer_intents")
    .select("id, buyer_agent_id, ip_type, max_budget_lamports, required_compliance, min_trust_tier, description, deadline, status, created_at, expires_at")
    .eq("status", status)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  if (ip_type) query = query.eq("ip_type", ip_type);
  if (minBudgetLamps > 0) query = query.gte("max_budget_lamports", minBudgetLamps);

  const { data, error } = await query;
  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }

  const intents = (data ?? []).map((row) => ({
    ...row,
    max_budget_sol: Number(row.max_budget_lamports) / 1e9,
  }));

  return Response.json(
    { intents, total: intents.length },
    { headers: CORS }
  );
}

// ---------------------------------------------------------------------------
// POST /api/intents — auth required (Bearer sk-* or session)
// Body: { buyer_agent_id, ip_type?, max_budget_sol, required_compliance?, min_trust_tier?, description, deadline? }
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
    buyer_agent_id,
    ip_type,
    max_budget_sol,
    required_compliance,
    min_trust_tier,
    description,
    deadline,
  } = body as {
    buyer_agent_id?:      string;
    ip_type?:             string;
    max_budget_sol?:      number;
    required_compliance?: string[];
    min_trust_tier?:      string;
    description?:         string;
    deadline?:            string;
  };

  if (!buyer_agent_id) {
    return Response.json({ error: "Missing required field: buyer_agent_id" }, { status: 400, headers: CORS });
  }
  if (!max_budget_sol || max_budget_sol <= 0) {
    return Response.json({ error: "max_budget_sol must be a positive number" }, { status: 400, headers: CORS });
  }

  const VALID_TIERS = ["UNVERIFIED", "ATTESTED", "AUDITED", "STAKED"];
  const tier = min_trust_tier?.toUpperCase();
  if (tier && !VALID_TIERS.includes(tier)) {
    return Response.json(
      { error: `min_trust_tier must be one of: ${VALID_TIERS.join(", ")}` },
      { status: 400, headers: CORS }
    );
  }

  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc
    .from("buyer_intents")
    .insert({
      buyer_agent_id,
      ip_type:             ip_type ?? null,
      max_budget_lamports: Math.floor(max_budget_sol * 1e9),
      required_compliance: required_compliance ?? [],
      min_trust_tier:      tier ?? "UNVERIFIED",
      description:         description ?? null,
      deadline:            deadline ?? null,
      status:              "OPEN",
    })
    .select("id, buyer_agent_id, ip_type, max_budget_lamports, status, expires_at, created_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return Response.json(
    {
      intent_id:       data.id,
      buyer_agent_id:  data.buyer_agent_id,
      ip_type:         data.ip_type,
      max_budget_sol,
      status:          data.status,
      expires_at:      data.expires_at,
      created_at:      data.created_at,
      message:         "Intent posted. Seller agents can discover this via GET /api/intents or the search_intents MCP tool.",
    },
    { status: 201, headers: CORS }
  );
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

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
  const { data, error } = await svc
    .from("api_keys")
    .select("id, expires_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error || !data) return false;
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) return false;
  return true;
}
