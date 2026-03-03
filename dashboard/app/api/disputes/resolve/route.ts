import { createClient as createServiceClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------------------
// POST /api/disputes/resolve — admin-only
// Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> or admin api key
// Body: { dispute_id, resolution: "REFUND_BUYER" | "RELEASE_SELLER" }
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  // Admin auth: accept service role key or a special ADMIN_API_KEY env var
  const adminKey   = process.env.ADMIN_API_KEY ?? serviceKey;
  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace("Bearer ", "").trim();
  if (token !== adminKey) {
    return Response.json({ error: "Admin authorization required" }, { status: 403, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }

  const { dispute_id, resolution } = body as {
    dispute_id: string;
    resolution: string;
  };

  if (!dispute_id || !resolution) {
    return Response.json(
      { error: "dispute_id and resolution are required" },
      { status: 400, headers: CORS }
    );
  }

  const VALID_RESOLUTIONS = ["REFUND_BUYER", "RELEASE_SELLER"];
  if (!VALID_RESOLUTIONS.includes(resolution)) {
    return Response.json(
      { error: `resolution must be one of: ${VALID_RESOLUTIONS.join(", ")}` },
      { status: 400, headers: CORS }
    );
  }

  const svc = createServiceClient(serviceUrl, serviceKey);

  // Fetch the dispute
  const { data: dispute, error: fetchErr } = await svc
    .from("disputes")
    .select("id, task_id, license_id, status")
    .eq("id", dispute_id)
    .maybeSingle();

  if (fetchErr || !dispute) {
    return Response.json({ error: "Dispute not found" }, { status: 404, headers: CORS });
  }
  if (dispute.status !== "OPEN") {
    return Response.json({ error: "Dispute is not OPEN" }, { status: 409, headers: CORS });
  }

  const now = new Date().toISOString();

  // Resolve in disputes table
  await svc
    .from("disputes")
    .update({ status: "RESOLVED", resolution, resolved_by: "ADMIN", resolved_at: now })
    .eq("id", dispute_id);

  // Update ip_license status based on resolution
  const newLicenseStatus = resolution === "RELEASE_SELLER" ? "SETTLED" : "DRAFT";
  await svc
    .from("ip_licenses")
    .update({ status: newLicenseStatus })
    .eq("id", dispute.license_id);

  // Note: on-chain resolve_dispute must be called separately via dispute_manager.py
  // or by the admin using the Anchor program directly (requires PLATFORM_SOLANA_KEYPAIR).

  return Response.json(
    {
      dispute_id,
      resolution,
      resolved_at:      now,
      license_status:   newLicenseStatus,
      message:
        `Dispute resolved: ${resolution}. License is now ${newLicenseStatus}. ` +
        `Run dispute_manager.py to submit the on-chain resolve_dispute instruction.`,
    },
    { headers: CORS }
  );
}
