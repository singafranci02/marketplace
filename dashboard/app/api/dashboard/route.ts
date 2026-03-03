import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const DB_PATH = join(process.cwd(), "..", "database.json");
const CORS = { "Access-Control-Allow-Origin": "*" };
const STALE_MS = 3 * 60 * 1000;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// GET /api/dashboard — full market snapshot for human + agent consumption
// Auth: Bearer sk-* API key OR valid Supabase session
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authorized = await checkAuth(request);
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  const [ledgerRes, vaultRes, licenseRes, hbRes, stakeRes] = await Promise.all([
    svc
      .from("ledger")
      .select("artifact, amount_lamports, on_chain_status, tx_hash, artifact_hash")
      .order("id", { ascending: false })
      .limit(20),
    svc.from("ip_vault").select("id, title, agent_id, status").eq("status", "active"),
    svc
      .from("ip_licenses")
      .select("id, licensor_agent_id, licensee_agent_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    svc.from("agent_heartbeats").select("agent_id, last_seen_at"),
    svc.from("agent_stakes").select("agent_id, lamports_staked"),
  ]);

  // Load agents from database.json
  let allAgents: Record<string, unknown>[] = [];
  if (existsSync(DB_PATH)) {
    try {
      allAgents = JSON.parse(readFileSync(DB_PATH, "utf-8")).agents ?? [];
    } catch { /* ignore */ }
  }

  // Build maps
  const heartbeatMap: Record<string, string> = {};
  for (const row of hbRes.data ?? []) heartbeatMap[row.agent_id] = row.last_seen_at;

  const stakeMap: Record<string, number> = {};
  for (const row of stakeRes.data ?? []) stakeMap[row.agent_id] = Number(row.lamports_staked);

  const liquidityMap: Record<string, number> = {};
  const dealCountMap: Record<string, number> = {};
  for (const row of ledgerRes.data ?? []) {
    const artifact = row.artifact as { parties?: { licensor?: { agent_id?: string } } };
    const sellerId = artifact?.parties?.licensor?.agent_id;
    if (sellerId && row.amount_lamports && row.on_chain_status === "VERIFIED_ON_CHAIN") {
      liquidityMap[sellerId] = (liquidityMap[sellerId] ?? 0) + Number(row.amount_lamports);
      dealCountMap[sellerId] = (dealCountMap[sellerId] ?? 0) + 1;
    }
  }

  // Annotate agents
  const now = Date.now();
  const hasAnyHb = Object.keys(heartbeatMap).length > 0;

  const agents = allAgents.map((a) => {
    const agentId  = a["agent_id"] as string;
    const lastSeen = heartbeatMap[agentId];
    const active   = hasAnyHb
      ? (lastSeen ? now - new Date(lastSeen).getTime() < STALE_MS : false)
      : true;

    const v_sol        = (liquidityMap[agentId] ?? 0) / 1e9;
    const staked_lamps = stakeMap[agentId] ?? 0;
    const staked_sol   = staked_lamps / 1e9;
    const w_stake      = Math.min(1.0 + staked_sol / 10.0, 2.0);
    const t_active     = dealCountMap[agentId] ?? 0;
    const score        = v_sol + (t_active * w_stake);

    const agentCompliance = (a["compliance"] as string[]) ?? [];
    let trust_tier: string;
    if (staked_sol > 0) trust_tier = "STAKED";
    else if (v_sol > 0 && (agentCompliance.includes("SOC2-Type2") || agentCompliance.includes("ISO27001"))) trust_tier = "AUDITED";
    else if (agentCompliance.length > 0) trust_tier = "ATTESTED";
    else trust_tier = "UNVERIFIED";

    return {
      agent_id:           agentId,
      name:               (a["name"] as string | null) ?? agentId,
      trust_tier,
      liquidity_score_sol: score.toFixed(4),
      status:             active ? "ACTIVE" : "INACTIVE",
    };
  });

  // Format deals
  const recent_deals = (ledgerRes.data ?? []).map((row) => {
    const artifact = row.artifact as Record<string, unknown>;
    const parties  = artifact.parties as {
      licensor?: { company?: string; agent_id?: string };
      licensee?: { company?: string; agent_id?: string };
    } | undefined;
    return {
      artifact_id:      (artifact.artifact_id as string | undefined) ?? null,
      artifact_type:    (artifact.artifact_type as string | undefined) ?? null,
      licensor:         parties?.licensor?.company ?? parties?.licensor?.agent_id ?? "unknown",
      licensee:         parties?.licensee?.company ?? parties?.licensee?.agent_id ?? "unknown",
      amount_sol:       row.amount_lamports ? (Number(row.amount_lamports) / 1e9).toFixed(4) : null,
      on_chain_status:  (row.on_chain_status as string | null) ?? "OFF_CHAIN",
      tx_hash:          (row.tx_hash as string | null) ?? null,
      issued_at:        (artifact.issued_at as string | undefined) ?? null,
    };
  });

  // Platform KPIs
  const ledgerAll     = ledgerRes.data ?? [];
  const licenses      = licenseRes.data ?? [];
  const total_sol_volume = ledgerAll
    .filter((r) => r.on_chain_status === "VERIFIED_ON_CHAIN")
    .reduce((s, r) => s + (r.amount_lamports ? Number(r.amount_lamports) / 1e9 : 0), 0);

  return Response.json(
    {
      snapshot_at: new Date().toISOString(),
      platform: {
        total_sol_volume:  parseFloat(total_sol_volume.toFixed(4)),
        active_agents:     agents.filter((a) => a.status === "ACTIVE").length,
        live_licenses:     licenses.filter((l) => l.status === "SIGNED" || l.status === "EXECUTING").length,
        active_vaults:     (vaultRes.data ?? []).length,
        on_chain_verified: ledgerAll.filter((r) => r.on_chain_status === "VERIFIED_ON_CHAIN").length,
        settled:           licenses.filter((l) => l.status === "SETTLED").length,
        revoked:           licenses.filter((l) => l.status === "REVOKED").length,
      },
      agents,
      recent_deals,
      licenses: licenses.map((l) => ({
        id:                 l.id,
        licensor_agent_id:  l.licensor_agent_id,
        licensee_agent_id:  l.licensee_agent_id,
        status:             l.status,
        created_at:         l.created_at,
      })),
      vaults: (vaultRes.data ?? []).map((v) => ({
        id:       v.id,
        title:    v.title,
        agent_id: v.agent_id,
        status:   v.status,
      })),
    },
    { headers: CORS }
  );
}

async function checkAuth(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer sk-")) {
    return verifyApiKey(authHeader.slice(7));
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
  const svc  = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc.from("api_keys").select("id").eq("key_hash", hash).single();
  return !error && data !== null;
}
