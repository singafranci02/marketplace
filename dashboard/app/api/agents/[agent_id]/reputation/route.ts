import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const DB_PATH = join(process.cwd(), "..", "database.json");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// GET /api/agents/[agent_id]/reputation
//
// Returns the Phase 29 DeFi Credit Score for a single agent with full breakdown.
//
// Formula:
//   Score = (V_sol × success_rate) + (T_active_bonus × W_stake)
//
//   V_sol        — total SOL processed through clearinghouse (seller side)
//   success_rate — SETTLED / total licenses (quality multiplier)
//   T_active_bonus — count of VERIFIED_ON_CHAIN deals (proxy for deal-days)
//   W_stake      — 1.0 + (staked_sol / 10.0), capped at 2.0
//
// Trust Tier (UNVERIFIED → ATTESTED → AUDITED → STAKED):
//   STAKED    : staked_sol > 0
//   AUDITED   : SOC2/ISO cert + on-chain volume > 0
//   ATTESTED  : any compliance cert
//   UNVERIFIED: no cert, no volume
// ---------------------------------------------------------------------------

function getTrustTier(
  compliance: string[],
  v_sol: number,
  success_rate: number,
  staked_sol: number
): string {
  if (staked_sol > 0) return "STAKED";
  if (
    v_sol > 0 &&
    success_rate > 0 &&
    (compliance.includes("SOC2-Type2") || compliance.includes("ISO27001"))
  )
    return "AUDITED";
  if (compliance.length > 0) return "ATTESTED";
  return "UNVERIFIED";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agent_id: string }> }
) {
  const { agent_id } = await params;

  // Load agent from database.json for compliance info
  if (!existsSync(DB_PATH)) {
    return Response.json({ error: "Agent database not found" }, { status: 404, headers: CORS });
  }

  let allAgents: Record<string, unknown>[] = [];
  try {
    allAgents = JSON.parse(readFileSync(DB_PATH, "utf-8")).agents ?? [];
  } catch {
    return Response.json({ error: "Failed to read agent database" }, { status: 500, headers: CORS });
  }

  const agent = allAgents.find((a) => a["agent_id"] === agent_id);
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404, headers: CORS });
  }

  const compliance = (agent["compliance"] as string[]) ?? [];

  // ── Supabase queries ──────────────────────────────────────────────────────
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let v_sol        = 0;
  let t_active     = 0;
  let settled      = 0;
  let total        = 0;
  let staked_lamps = 0;

  if (serviceUrl && serviceKey) {
    const svc = createServiceClient(serviceUrl, serviceKey);

    // V_sol + T_active_bonus from ledger
    const { data: ledgerData } = await svc
      .from("ledger")
      .select("artifact, amount_lamports")
      .eq("on_chain_status", "VERIFIED_ON_CHAIN")
      .not("amount_lamports", "is", null);

    for (const row of ledgerData ?? []) {
      const artifact = row.artifact as { parties?: { licensor?: { agent_id?: string } } };
      const sellerId = artifact?.parties?.licensor?.agent_id;
      if (sellerId === agent_id && row.amount_lamports) {
        v_sol    += Number(row.amount_lamports) / 1e9;
        t_active += 1;
      }
    }

    // Success rate from ip_licenses
    const { data: licenseData } = await svc
      .from("ip_licenses")
      .select("status")
      .eq("licensor_agent_id", agent_id);
    for (const row of licenseData ?? []) {
      total += 1;
      if (row.status === "SETTLED") settled += 1;
    }

    // W_stake from agent_stakes
    const { data: stakeRow } = await svc
      .from("agent_stakes")
      .select("lamports_staked")
      .eq("agent_id", agent_id)
      .maybeSingle();
    staked_lamps = Number(stakeRow?.lamports_staked ?? 0);
  }

  const success_rate = total > 0 ? settled / total : 1.0;
  const staked_sol   = staked_lamps / 1e9;
  const w_stake      = Math.min(1.0 + staked_sol / 10.0, 2.0);
  const score        = (v_sol * success_rate) + (t_active * w_stake);
  const trust_tier   = getTrustTier(compliance, v_sol, success_rate, staked_sol);

  return Response.json(
    {
      agent_id,
      liquidity_score: score.toFixed(4),
      trust_tier,
      breakdown: {
        v_total_sol:    v_sol.toFixed(4),
        success_rate:   success_rate.toFixed(4),
        t_active_bonus: t_active,
        stake_weight:   w_stake.toFixed(4),
        staked_sol:     staked_sol.toFixed(4),
      },
    },
    { headers: CORS }
  );
}
