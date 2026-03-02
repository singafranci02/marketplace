import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const DB_PATH = join(process.cwd(), "..", "database.json");
const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

// ---------------------------------------------------------------------------
// GET /api/referral/leaderboard
//
// Returns the top 10 agents by total SOL earned through referral rewards.
// Public, no auth required.
//
// Aggregates: SUM(reward_lamports) + COUNT(*) per referrer_agent_id,
// sorted descending. Enriched with agent name from database.json.
// ---------------------------------------------------------------------------

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceUrl || !serviceKey) {
    return Response.json([], { headers: CORS });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Aggregate referral rewards per agent
  const { data: rows } = await svc
    .from("referrals")
    .select("referrer_agent_id, reward_lamports")
    .not("reward_lamports", "is", null)
    .gt("reward_lamports", 0);

  if (!rows?.length) {
    return Response.json([], { headers: CORS });
  }

  // Aggregate client-side (Supabase free tier doesn't expose GROUP BY via JS client)
  const aggMap: Record<string, { total_lamports: number; deal_count: number }> = {};
  for (const row of rows) {
    const id = row.referrer_agent_id as string;
    if (!id) continue;
    if (!aggMap[id]) aggMap[id] = { total_lamports: 0, deal_count: 0 };
    aggMap[id].total_lamports += Number(row.reward_lamports);
    aggMap[id].deal_count     += 1;
  }

  // Sort by total earned, take top 10
  const sorted = Object.entries(aggMap)
    .sort(([, a], [, b]) => b.total_lamports - a.total_lamports)
    .slice(0, 10);

  // Enrich with agent name from database.json
  let agentNameMap: Record<string, string> = {};
  if (existsSync(DB_PATH)) {
    try {
      const agents = JSON.parse(readFileSync(DB_PATH, "utf-8")).agents ?? [];
      for (const a of agents) {
        if (a.agent_id && a.name) agentNameMap[a.agent_id] = a.name;
      }
    } catch { /* silent */ }
  }

  const result = sorted.map(([agent_id, { total_lamports, deal_count }], i) => ({
    rank:       i + 1,
    agent_id,
    name:       agentNameMap[agent_id] ?? agent_id.slice(0, 16) + "…",
    earned_sol: (total_lamports / 1e9).toFixed(4),
    deal_count,
  }));

  return Response.json(result, { headers: CORS });
}
