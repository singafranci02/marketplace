import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient }                        from "@/lib/supabase/server";
import { createHash }                          from "crypto";

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// GET /api/disputes — public, CORS *
// Query params: status (default OPEN), limit (default 20)
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const url    = new URL(req.url);
  const status = url.searchParams.get("status") ?? "OPEN";
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data, error } = await svc
    .from("disputes")
    .select("id, license_id, artifact_id, task_id, reason, dispute_hash, status, resolution, on_chain_tx, resolved_at, created_at")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return Response.json({ disputes: data ?? [], total: (data ?? []).length }, { headers: CORS });
}

// ---------------------------------------------------------------------------
// POST /api/disputes — file a dispute (auth required: Bearer sk-*)
// Body: { license_id, artifact_id, task_id, reason, evidence_ipfs? }
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return Response.json({ error: "Authorization required" }, { status: 401, headers: CORS });
  }

  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data: keyRow } = await svc
    .from("api_keys")
    .select("id")
    .eq("key", token)
    .maybeSingle();
  if (!keyRow) {
    return Response.json({ error: "Invalid API key" }, { status: 401, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }

  const { license_id, artifact_id, task_id, reason, evidence_ipfs } = body as {
    license_id:    string;
    artifact_id:   string;
    task_id:       string;
    reason:        string;
    evidence_ipfs?: string;
  };

  if (!license_id || !artifact_id || !task_id || !reason) {
    return Response.json(
      { error: "license_id, artifact_id, task_id, and reason are required" },
      { status: 400, headers: CORS }
    );
  }

  // Compute dispute_hash = sha256(reason + evidence_ipfs)
  const dispute_hash = createHash("sha256")
    .update(reason + (evidence_ipfs ?? ""))
    .digest("hex");

  const { data: inserted, error } = await svc
    .from("disputes")
    .insert({
      license_id,
      artifact_id,
      task_id,
      reason,
      evidence_ipfs: evidence_ipfs ?? null,
      dispute_hash,
      status: "OPEN",
    })
    .select("id, status, dispute_hash, created_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return Response.json(
    {
      dispute_id:   inserted.id,
      status:       inserted.status,
      dispute_hash: inserted.dispute_hash,
      created_at:   inserted.created_at,
      message:      "Dispute filed. The platform admin will review within 24 hours.",
    },
    { status: 201, headers: CORS }
  );
}
