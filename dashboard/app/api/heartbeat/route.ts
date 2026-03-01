import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const DB_PATH = join(process.cwd(), "..", "database.json");

export async function POST(request: Request) {
  // Auth — Bearer sk- key only (agents don't have a browser session)
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  if (!token.startsWith("sk-")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const svc  = createServiceClient(serviceUrl, serviceKey);
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: keyRow, error: keyErr } = await svc
    .from("api_keys")
    .select("id")
    .eq("key_hash", hash)
    .single();

  if (keyErr || !keyRow) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: { agent_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agent_id } = body;
  if (!agent_id) {
    return Response.json({ error: "agent_id required" }, { status: 400 });
  }

  // Validate agent exists in registry
  let known = false;
  if (existsSync(DB_PATH)) {
    try {
      const db = JSON.parse(readFileSync(DB_PATH, "utf-8"));
      known = (db.agents ?? []).some(
        (a: { agent_id: string }) => a.agent_id === agent_id
      );
    } catch { /* ignore parse errors */ }
  }
  if (!known) {
    return Response.json({ error: "Unknown agent_id" }, { status: 404 });
  }

  // Upsert heartbeat timestamp
  const last_seen_at = new Date().toISOString();
  const { error } = await svc
    .from("agent_heartbeats")
    .upsert({ agent_id, last_seen_at }, { onConflict: "agent_id" });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ agent_id, last_seen_at, status: "OK" });
}
