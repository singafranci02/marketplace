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

  // ── Liveness filter ─────────────────────────────────────────────────────
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const heartbeatMap: Record<string, string> = {};
  if (serviceUrl && serviceKey) {
    const svc = createServiceClient(serviceUrl, serviceKey);
    const { data } = await svc
      .from("agent_heartbeats")
      .select("agent_id, last_seen_at");
    for (const row of data ?? []) {
      heartbeatMap[row.agent_id] = row.last_seen_at;
    }
  }

  const STALE_MS = 3 * 60 * 1000;
  const now = Date.now();
  const hasAnyHeartbeat = Object.keys(heartbeatMap).length > 0;

  const annotated = results.map((a) => {
    const lastSeen = heartbeatMap[a["agent_id"] as string];
    const active = hasAnyHeartbeat
      ? (lastSeen ? now - new Date(lastSeen).getTime() < STALE_MS : false)
      : true;
    return {
      ...a,
      status:    active ? "ACTIVE" : "INACTIVE",
      last_seen: lastSeen ?? null,
    };
  });

  const active       = annotated.filter((a) => a.status === "ACTIVE");
  const inactiveCount = annotated.length - active.length;

  return Response.json(
    { agents: active, total: active.length, inactive_count: inactiveCount },
    { headers: CORS_HEADERS }
  );
}
