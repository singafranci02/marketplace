import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const DB_PATH = join(process.cwd(), "..", "database.json");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  if (!existsSync(DB_PATH)) {
    return Response.json({ agents: [], total: 0 }, { headers: CORS_HEADERS });
  }

  let allAgents: Record<string, unknown>[] = [];
  try {
    allAgents = JSON.parse(readFileSync(DB_PATH, "utf-8")).agents ?? [];
  } catch {
    return Response.json(
      { error: "Failed to read agent database" },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const { searchParams } = req.nextUrl;
  const capability = searchParams.get("capability")?.toLowerCase();
  const compliance = searchParams.get("compliance")?.toLowerCase();
  const id         = searchParams.get("id");

  let results = allAgents;

  // Filter by agent_id exact match
  if (id) {
    results = results.filter((a) => a["agent_id"] === id);
  }

  // Filter by capability (method name or description substring)
  if (capability) {
    results = results.filter((a) => {
      const caps = a["capabilities"] as Array<{ method: string; description: string }>;
      return caps?.some(
        (c) =>
          c.method.toLowerCase().includes(capability) ||
          c.description.toLowerCase().includes(capability)
      );
    });
  }

  // Filter by compliance standard
  if (compliance) {
    results = results.filter((a) => {
      const comp = a["compliance"] as string[];
      return comp?.some((c) => c.toLowerCase().includes(compliance));
    });
  }

  // ── Liveness + Liquidity Score ───────────────────────────────────────────
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const heartbeatMap:       Record<string, string> = {};
  const liquidityMap:       Record<string, number> = {};  // agent_id → total lamports processed

  if (serviceUrl && serviceKey) {
    const svc = createServiceClient(serviceUrl, serviceKey);

    // Heartbeats
    const { data: hbData } = await svc
      .from("agent_heartbeats")
      .select("agent_id, last_seen_at");
    for (const row of hbData ?? []) {
      heartbeatMap[row.agent_id] = row.last_seen_at;
    }

    // Liquidity Score: sum amount_lamports per seller agent from verified ledger entries
    const { data: ledgerData } = await svc
      .from("ledger")
      .select("artifact, amount_lamports")
      .eq("on_chain_status", "VERIFIED_ON_CHAIN")
      .not("amount_lamports", "is", null);

    for (const row of ledgerData ?? []) {
      const artifact = row.artifact as { parties?: { licensor?: { agent_id?: string } } };
      const sellerId = artifact?.parties?.licensor?.agent_id;
      if (sellerId && row.amount_lamports) {
        liquidityMap[sellerId] = (liquidityMap[sellerId] ?? 0) + Number(row.amount_lamports);
      }
    }
  }

  const STALE_MS = 3 * 60 * 1000;
  const now = Date.now();
  const hasAnyHeartbeat = Object.keys(heartbeatMap).length > 0;

  const annotated = results.map((a) => {
    const agentId  = a["agent_id"] as string;
    const lastSeen = heartbeatMap[agentId];
    const active   = hasAnyHeartbeat
      ? (lastSeen ? now - new Date(lastSeen).getTime() < STALE_MS : false)
      : true;
    const lamports          = liquidityMap[agentId] ?? 0;
    const liquidity_score_sol = (lamports / 1e9).toFixed(4);

    return {
      ...a,
      status:              active ? "ACTIVE" : "INACTIVE",
      last_seen:           lastSeen ?? null,
      liquidity_score_sol, // Phase 28: total SOL processed through the clearinghouse
    };
  });

  const active        = annotated.filter((a) => a.status === "ACTIVE");
  const inactiveCount = annotated.length - active.length;

  return Response.json(
    { agents: active, total: active.length, inactive_count: inactiveCount },
    { headers: CORS_HEADERS }
  );
}
