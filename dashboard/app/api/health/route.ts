import { createClient as createServiceClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*" };

// ---------------------------------------------------------------------------
// GET /api/health — public, no auth required
// Returns platform liveness + kill-switch state so agents can self-halt.
// ---------------------------------------------------------------------------

export async function GET() {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceUrl || !serviceKey) {
    return Response.json(
      { status: "ok", kill_switch: { active: false, activated_at: null } },
      { headers: CORS }
    );
  }

  const svc = createServiceClient(serviceUrl, serviceKey);
  const { data } = await svc
    .from("kill_switch")
    .select("active, activated_at")
    .eq("id", 1)
    .single();

  const killSwitch = {
    active:       data?.active ?? false,
    activated_at: data?.activated_at ?? null,
  };

  return Response.json(
    {
      status:      killSwitch.active ? "kill_switch_active" : "ok",
      kill_switch: killSwitch,
    },
    { headers: CORS }
  );
}
